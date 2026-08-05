import { NumberFlow, colors, elevation, gradient, gray, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useMyPayout, useMyPayoutOrders } from "../hooks/useMyPayout";
import type { PayoutOrderItem } from "../hooks/useMyPayout";
import { useMonthlyPickupStats } from "../hooks/useTodayStats";

/**
 * R7 "수거 실적"(08 G6-④). 쿠폰 요약(07 F6-⑤)을 제거하고 이번 달 지급을 수단 분리로 재구성:
 * 현금 지급/포인트 지급 히어로(건수 병기) + 수거 건수/수거량 카드 + 일별 지급 내역(현금·포인트 병기).
 * 완료 집계는 completed_at 기준 + 레거시 coalesce 규약(useMonthlyPickupStats).
 * 포인트 지급분은 플랫폼이 점주에게 부담(EARN)하므로 라이더 지갑 개념은 없다(08 P5).
 */

/** v_my_payout_daily의 day(YYYY-MM-DD)를 "MM.DD"로 줄인다 — 이번 달 스코프라 연·월 반복은 소음. */
function formatDayLabel(day: string): string {
  return day.slice(5).replace("-", ".");
}

/** 완료 시각(로컬) "HH:MM". 일자 묶음은 UTC(뷰 규약)지만 시각 표기는 라이더 체감 시간. */
function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 건별 지급액 표기 — 일별 행과 같은 net 규약. null=지급 없던 완료 주문(레거시). */
function formatOrderAmount(o: PayoutOrderItem): string {
  if (o.amount == null) return "지급 없음";
  return o.payoutMethod === "POINT" ? `🪙 ${formatPoint(o.amount)}` : `💵 ${formatKrw(o.amount)}`;
}
export function EarningsPage() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: stats, isLoading: statsLoading } = useMonthlyPickupStats(userId);
  // [16 L9] 플랫폼 정산 대사 — v_my_payout_daily(본인 스코프). 지갑·출금 아님(08 P5).
  const { data: payout } = useMyPayout(userId);
  // 건별 펼침용 — 뷰와 같은 net 규약·UTC 일자 묶음이라 일별 행과 합이 맞는다.
  const { data: orderGroups } = useMyPayoutOrders(userId);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>수거 실적</h1>

      {statsLoading ? (
        <div data-testid="stats-skeleton" style={{ borderRadius: 16, height: 96, backgroundColor: gray[100] }} />
      ) : (
        <>
          {/* 08 G6-④: 이번 달 지급 히어로 — 현금/포인트 분리(건수 병기). */}
          <section
            data-testid="monthly-cash"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: "24px 20px",
              borderRadius: radius.hero,
              // [15] 목업의 다크 실적 히어로 — 이번 달 지급이 이 화면의 주인공이다.
              background: `radial-gradient(circle at 82% 12%, ${colors.lime.soft}, transparent 40%), ${gradient.heroDeep}`,
              boxShadow: elevation.heroDark,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                💵 이번 달 현금 지급 · {stats?.cashCount ?? 0}건
              </p>
              {/* [15] 화면 진입·갱신 시 카운트업 — 접근성 트리에는 최종 금액만 노출된다. */}
              {/* [M] 확대 시 fontSize를 폭에 맞춰 줄이고(clamp), 금액은 자릿수 중간 절단 없이 행 단위로만 개행. */}
              <p style={{ margin: 0, minWidth: 0, overflowWrap: "normal" }}>
                <NumberFlow
                  testId="monthly-cash-amount"
                  value={stats?.cash ?? 0}
                  format={(n) => formatKrw(Math.round(n))}
                  style={{ fontSize: "clamp(24px, 8vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
                />
              </p>
            </div>
            <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                🪙 이번 달 포인트 지급 · {stats?.pointCount ?? 0}건
              </p>
              <p style={{ margin: 0, minWidth: 0, overflowWrap: "normal" }}>
                <NumberFlow
                  testId="monthly-point-amount"
                  value={stats?.point ?? 0}
                  format={(n) => formatPoint(Math.round(n))}
                  style={{ fontSize: "clamp(24px, 8vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
                />
              </p>
            </div>
          </section>

          {/* 건수 / 수거량. */}
          <section style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div
              data-testid="monthly-count"
              style={{ flex: 1, minWidth: 0, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>이번 달 수거</p>
              <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
                {stats?.count ?? 0}
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.status.wait }}>건</span>
              </p>
            </div>
            <div
              data-testid="monthly-kg"
              style={{ flex: 1, minWidth: 0, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>이번 달 수거량</p>
              <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
                {formatKg(stats?.kg ?? 0)}
              </p>
            </div>
          </section>

          {/* 일별 지급 내역 — v_my_payout_daily. 히어로 합계의 세부내역으로 현금·포인트를 병기한다.
              현금은 현장에서 이미 지급받은 금액(음수 = 상계 차액을 점주에게 지급, 부호 보존 참고 표기),
              포인트는 아래 플랫폼 정산 카드의 대사 근거가 되는 발행분이다. */}
          {(payout?.days ?? []).length > 0 && (
            <section
              data-testid="daily-payout-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 16,
                borderRadius: radius.card,
                backgroundColor: surface.card,
                border: `1px solid ${surface.border}`,
                boxShadow: elevation.card,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>일별 지급 내역</p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {(payout?.days ?? []).map((d) => (
                  <li key={d.day}>
                    {/* 날짜 행을 펼치면 그날 건별(시각·주소·kg·지급액)이 보인다. */}
                    <details data-testid={`daily-payout-day-${d.day}`}>
                      <summary
                        className="oilpick-tabular-nums"
                        style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 13, color: gray[800], cursor: "pointer", minHeight: 32, listStyle: "none" }}
                      >
                        {/* [M] nowrap 금지 — 글자 확대 시 좌측이 접히고 금액(우측)은 행 단위로만 개행된다. */}
                        <span style={{ minWidth: 0 }}>
                          {formatDayLabel(d.day)} · {d.completedCount}건 · {formatKg(d.totalKg)}
                        </span>
                        <span style={{ flexShrink: 0, fontWeight: 700, textAlign: "right" }}>
                          💵 {formatKrw(d.cashAmount)} · 🪙 {formatPoint(d.pointAmount)}
                        </span>
                      </summary>
                      <ul
                        data-testid={`daily-payout-orders-${d.day}`}
                        style={{ margin: "4px 0 4px", padding: "0 0 0 8px", listStyle: "none", display: "flex", flexDirection: "column", gap: 8, borderLeft: `2px solid ${surface.border}` }}
                      >
                        {(orderGroups?.[d.day] ?? []).map((o) => (
                          <li key={o.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: gray[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {o.pickupAddress}
                            </span>
                            <span className="oilpick-tabular-nums" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, fontSize: 12, color: colors.status.wait }}>
                              <span>
                                {formatTimeLabel(o.completedAt)}
                                {o.finalKg != null && ` · ${formatKg(o.finalKg)}`}
                              </span>
                              <span style={{ fontWeight: 700, color: gray[800] }}>{formatOrderAmount(o)}</span>
                            </span>
                          </li>
                        ))}
                        {(orderGroups?.[d.day] ?? []).length === 0 && (
                          <li style={{ fontSize: 12, color: colors.status.wait }}>건별 내역을 불러오고 있어요…</li>
                        )}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
                날짜를 누르면 건별 내역이 보여요. 현금은 현장에서 지급받은 금액이에요. 포인트 지급분은 아래 플랫폼 정산으로 받아요.
              </p>
            </section>
          )}

          {/* [16 L9 §6-2] 플랫폼 정산 카드 — 포인트 지급분은 플랫폼이 점주에게 부담(EARN)했으므로
              플랫폼이 라이더에게 정산할 금액의 대사 근거다. 지갑/출금 오해 차단 카피 필수(08 P5). */}
          <section
            data-testid="my-payout-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 16,
              borderRadius: radius.card,
              backgroundColor: surface.card,
              border: `1px solid ${surface.border}`,
              boxShadow: elevation.card,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>플랫폼 정산 (이번 달 포인트 지급분)</p>
            <p data-testid="my-payout-total" className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.dark }}>
              {formatPoint(payout?.monthPointTotal ?? 0)}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
              오프라인 정산 대상 금액 — 지급 일정은 본사 안내를 따라요.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

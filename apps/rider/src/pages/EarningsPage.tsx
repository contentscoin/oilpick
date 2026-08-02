import { NumberFlow, colors, elevation, gradient, gray, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useMyPayout } from "../hooks/useMyPayout";
import { useMonthlyPickupStats } from "../hooks/useTodayStats";

/**
 * R7 "수거 실적"(08 G6-④). 쿠폰 요약(07 F6-⑤)을 제거하고 이번 달 지급을 수단 분리로 재구성:
 * 현금 지급/포인트 지급 히어로(건수 병기) + 수거 건수/수거량 카드.
 * 완료 집계는 completed_at 기준 + 레거시 coalesce 규약(useMonthlyPickupStats).
 * 포인트 지급분은 플랫폼이 점주에게 부담(EARN)하므로 라이더 지갑 개념은 없다(08 P5).
 */
export function EarningsPage() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: stats, isLoading: statsLoading } = useMonthlyPickupStats(userId);
  // [16 L9] 플랫폼 정산 대사 — v_my_payout_daily(본인 스코프). 지갑·출금 아님(08 P5).
  const { data: payout } = useMyPayout(userId);

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
              <p style={{ margin: 0 }}>
                <NumberFlow
                  testId="monthly-cash-amount"
                  value={stats?.cash ?? 0}
                  format={(n) => formatKrw(Math.round(n))}
                  style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
                />
              </p>
            </div>
            <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                🪙 이번 달 포인트 지급 · {stats?.pointCount ?? 0}건
              </p>
              <p style={{ margin: 0 }}>
                <NumberFlow
                  testId="monthly-point-amount"
                  value={stats?.point ?? 0}
                  format={(n) => formatPoint(Math.round(n))}
                  style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
                />
              </p>
            </div>
          </section>

          {/* 건수 / 수거량. */}
          <section style={{ display: "flex", gap: 12 }}>
            <div
              data-testid="monthly-count"
              style={{ flex: 1, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>이번 달 수거</p>
              <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
                {stats?.count ?? 0}
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.status.wait }}>건</span>
              </p>
            </div>
            <div
              data-testid="monthly-kg"
              style={{ flex: 1, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>이번 달 수거량</p>
              <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
                {formatKg(stats?.kg ?? 0)}
              </p>
            </div>
          </section>

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
            {(payout?.days ?? []).length > 0 && (
              <details data-testid="my-payout-days">
                <summary style={{ fontSize: 13, fontWeight: 600, color: colors.primary.DEFAULT, cursor: "pointer", minHeight: 32 }}>
                  일별 내역 보기
                </summary>
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {(payout?.days ?? []).map((d) => (
                    <li
                      key={d.day}
                      className="oilpick-tabular-nums"
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: gray[800] }}
                    >
                      <span>{d.day} · {d.completedCount}건</span>
                      <span style={{ fontWeight: 700 }}>{formatPoint(d.pointAmount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
    </main>
  );
}

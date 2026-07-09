import { useNavigate } from "react-router-dom";
import { BigButton, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useMonthlyPickupStats } from "../hooks/useTodayStats";
import { useCouponLedger } from "../hooks/useCoupons";

/**
 * R7 "수거 실적"(07 F6-⑤, 구 "정산"). 신모델 현금 매입으로 재정의:
 * 포인트 잔액/출금 UI를 제거하고 이번 달 수거 건수/kg/현금 지급 총액 + 쿠폰 소진/충전 요약을 보여준다.
 * 완료 집계는 completed_at 기준 + 레거시 coalesce 규약(useMonthlyPickupStats), 쿠폰 요약은
 * useCouponLedger를 재사용해 이번 달 CONSUME/CHARGE 합을 계산한다.
 */
function monthStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export function EarningsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: stats, isLoading: statsLoading } = useMonthlyPickupStats(userId);
  const { data: couponEntries } = useCouponLedger(userId);

  const from = monthStartMs();
  const monthEntries = (couponEntries ?? []).filter((e) => new Date(e.createdAt).getTime() >= from);
  const chargedCoupons = monthEntries
    .filter((e) => e.entryType === "CHARGE")
    .reduce((sum, e) => sum + e.amount, 0);
  const consumedCoupons = monthEntries
    .filter((e) => e.entryType === "CONSUME")
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>수거 실적</h1>

      {statsLoading ? (
        <div data-testid="stats-skeleton" style={{ borderRadius: 16, height: 96, backgroundColor: gray[100] }} />
      ) : (
        <>
          {/* 이번 달 현금 지급 총액 히어로. */}
          <section
            data-testid="monthly-cash"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "24px 20px",
              borderRadius: radius.hero,
              backgroundColor: colors.accent.light,
              border: `1px solid ${surface.border}`,
              boxShadow: elevation.card,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>이번 달 지급한 현금</p>
            <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: colors.accent.DEFAULT }}>
              {formatKrw(stats?.cash ?? 0)}
            </p>
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
        </>
      )}

      {/* 쿠폰 요약 + 링크. */}
      <section
        data-testid="coupon-summary"
        style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
      >
        <h2 style={{ fontSize: 16, margin: 0, color: gray[900] }}>이번 달 쿠폰</h2>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: colors.status.wait }}>충전</span>
          <span className="oilpick-tabular-nums" style={{ fontWeight: 700, color: colors.primary.DEFAULT }}>{chargedCoupons}장</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: colors.status.wait }}>소진</span>
          <span className="oilpick-tabular-nums" style={{ fontWeight: 700, color: gray[900] }}>{consumedCoupons}장</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <BigButton variant="secondary" data-testid="coupon-ledger-link" onClick={() => navigate("/coupons")}>
            쿠폰 내역
          </BigButton>
          <BigButton data-testid="coupon-charge-link" onClick={() => navigate("/coupons/purchase")}>
            충전
          </BigButton>
        </div>
      </section>
    </main>
  );
}

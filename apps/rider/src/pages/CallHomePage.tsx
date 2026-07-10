import { useNavigate } from "react-router-dom";
import {
  CallCard,
  EmptyState,
  PointBalanceCard,
  PointHeroAction,
  colors,
  elevation,
  gray,
  radius,
  surface,
  useToast,
} from "@oilpick/ui";
import { estimateCash, formatKg, formatKrw } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";
import { useOpenCalls } from "../hooks/useOpenCalls";
import { useCouponBalance } from "../hooks/useCoupons";
import { useTodayStats } from "../hooks/useTodayStats";
import { useGeolocation } from "../hooks/useGeolocation";
import { distanceKm } from "../lib/geo";
import { supabase } from "../lib/supabaseClient";

/**
 * R2 콜 홈. 03-frontend.md: "온라인 토글(rider_profiles.is_online) + 오늘 실적 + REQUESTED
 * 주문 목록(RLS open_calls, 거리순 정렬 — 거리는 클라이언트 계산)".
 */
export function CallHomePage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  // 06 E6: 온·오프라인 토글 성공/실패 피드백 토스트(기존엔 실패 시 console.error뿐).
  const { showToast } = useToast();

  const { data: rider } = useRiderProfile(userId);
  const { data: stats } = useTodayStats(userId);
  const { data: couponBalance } = useCouponBalance(userId);
  const position = useGeolocation(true);
  const { data: calls, isLoading } = useOpenCalls(Boolean(rider) && rider?.verifyStatus === "APPROVED");

  const sortedCalls = position
    ? [...(calls ?? [])].sort(
        (a, b) =>
          distanceKm(position, { lat: a.pickupLat, lng: a.pickupLng }) -
          distanceKm(position, { lat: b.pickupLat, lng: b.pickupLng }),
      )
    : (calls ?? []);

  async function handleToggleOnline() {
    if (!userId || !rider) return;
    // CLAUDE.md 절대 규칙 2/3 관련 없음: is_online은 상태전이(pickup_orders)가 아니라
    // 라이더 자신의 온오프 토글이고, RLS p_rider_self가 본인 행 update를 허용한다.
    const goingOnline = !rider.isOnline;
    const { error } = await supabase
      .from("rider_profiles")
      .update({ is_online: goingOnline })
      .eq("id", userId);
    if (error) {
      // E6: 실패는 에러 토스트 + 재시도(같은 방향으로 다시 시도).
      showToast("온라인 상태 변경에 실패했어요", {
        variant: "error",
        onRetry: () => void handleToggleOnline(),
      });
      return;
    }
    showToast(goingOnline ? "온라인 전환됐어요" : "오프라인으로 전환했어요", { variant: "success" });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, margin: "8px 0 0" }}>콜 홈</h1>
        <button
          type="button"
          data-testid="online-toggle"
          aria-pressed={rider?.isOnline ?? false}
          onClick={handleToggleOnline}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            backgroundColor: rider?.isOnline ? colors.primary.DEFAULT : gray[200],
            color: rider?.isOnline ? "#fff" : colors.status.wait,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {/* 05-design-upgrade.md "라이더 콜홈 스탯": on일 때 채워진 점 + green pill. */}
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: rider?.isOnline ? "#fff" : colors.status.wait,
            }}
          />
          {rider?.isOnline ? "온라인" : "오프라인"}
        </button>
      </div>

      {/* 07 F5-①: 쿠폰 잔액 히어로(v_coupon_balance + Realtime). [충전하기]→결제 화면, 카드 탭→쿠폰 내역. */}
      <PointBalanceCard
        available={couponBalance ?? 0}
        label="보유 수거쿠폰"
        formatValue={(n) => `${n}장`}
        onClick={() => navigate("/coupons")}
        action={
          <PointHeroAction
            data-testid="coupon-charge-button"
            onClick={(e) => {
              e.stopPropagation();
              navigate("/coupons/purchase");
            }}
          >
            충전하기
          </PointHeroAction>
        }
      />

      {/* 07 F6-⑥ "오늘 실적": 신모델 현금 매입 기준(수거 kg / 지급 현금 / 소진 쿠폰, completed_at 기준). */}
      <section data-testid="today-stats" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              flex: 1,
              borderRadius: radius.card,
              padding: 16,
              backgroundColor: surface.card,
              border: `1px solid ${surface.border}`,
              boxShadow: elevation.card,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>오늘 수거량</p>
            <p data-testid="today-collected-kg" className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
              {formatKg(stats?.collectedKg ?? 0)}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.status.wait }}>{stats?.completedCount ?? 0}건</p>
          </div>
          <div
            style={{
              flex: 1,
              borderRadius: radius.card,
              padding: 16,
              backgroundColor: surface.card,
              border: `1px solid ${surface.border}`,
              boxShadow: elevation.card,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>오늘 지급 현금</p>
            <p data-testid="today-cash" className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.DEFAULT }}>
              {formatKrw(stats?.cashPaid ?? 0)}
            </p>
          </div>
        </div>
        <p data-testid="today-coupons" style={{ margin: 0, fontSize: 13, color: colors.status.wait, textAlign: "center" }}>
          오늘 소진 쿠폰 {stats?.consumedCoupons ?? 0}장
        </p>
      </section>

      {!rider?.isOnline && (
        <p data-testid="offline-notice" style={{ margin: 0, fontSize: 13, color: colors.status.wait, textAlign: "center" }}>
          온라인으로 전환하면 주변 콜을 받을 수 있어요.
        </p>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>주변 콜</h2>
        {isLoading && (
          <div data-testid="open-calls-skeleton" style={{ height: 80, borderRadius: radius.card, backgroundColor: gray[100] }} />
        )}
        {!isLoading && sortedCalls.length === 0 && (
          <EmptyState title="지금은 콜이 없어요" description="새 콜이 들어오면 알려드릴게요." />
        )}
        {!isLoading &&
          sortedCalls.map((call) => (
            <CallCard
              key={call.id}
              data-testid={`call-card-${call.id}`}
              distanceKm={position ? distanceKm(position, { lat: call.pickupLat, lng: call.pickupLng }) : 0}
              estimatedKg={call.requestedKg}
              estimatedCash={estimateCash(call.requestedKg, call.snapshotPricePerKg)}
              couponCost={call.couponCost}
              address={call.pickupAddress}
              onClick={() => navigate(`/calls/${call.id}`)}
            />
          ))}
      </section>
    </main>
  );
}

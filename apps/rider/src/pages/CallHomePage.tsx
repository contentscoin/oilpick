import { useNavigate } from "react-router-dom";
import { CallCard, EmptyState, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import { formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";
import { useOpenCalls } from "../hooks/useOpenCalls";
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

  const { data: rider } = useRiderProfile(userId);
  const { data: stats } = useTodayStats(userId);
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
    const { error } = await supabase
      .from("rider_profiles")
      .update({ is_online: !rider.isOnline })
      .eq("id", userId);
    if (error) console.error("온라인 상태 변경 실패", error);
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

      {/* 05-design-upgrade.md "라이더 콜홈 스탯": 오늘 실적을 2개 스탯 카드로 나란히. */}
      <section data-testid="today-stats" style={{ display: "flex", gap: 12 }}>
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
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>오늘 완료</p>
          <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.DEFAULT }}>
            {stats?.completedCount ?? 0}
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.status.wait }}>건</span>
          </p>
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
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>오늘 확정 포인트</p>
          <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.DEFAULT }}>
            {formatPoint(stats?.earnedPoint ?? 0)}
          </p>
        </div>
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
              pickupFee={call.snapshotRiderFee}
              address={call.pickupAddress}
              onClick={() => navigate(`/calls/${call.id}`)}
            />
          ))}
      </section>
    </main>
  );
}

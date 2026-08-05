import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CallCard,
  DynamicIsland,
  EmptyState,
  colors,
  elevation,
  gray,
  radius,
  surface,
  useToast,
} from "@oilpick/ui";
import { estimateCash, formatKg, formatKrw, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";
import { useOpenCalls } from "../hooks/useOpenCalls";
import { useTodayStats } from "../hooks/useTodayStats";
import { useGeolocation } from "../hooks/useGeolocation";
import { distanceKm } from "../lib/geo";
import { supabase } from "../lib/supabaseClient";

/**
 * [16 L3 §3-4] 콜 목록 정렬 기준. 기본 가까운순 유지(16 §10-3 권고 기본값) — 클라이언트 정렬
 * 전용이라 배차 규칙(13 D7 전체 공개)은 불변이다.
 */
type CallSort = "distance" | "amount" | "recent";

const CALL_SORT_LABEL: Record<CallSort, string> = {
  distance: "가까운순",
  amount: "지급액순",
  recent: "최신순",
};

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
  const { data: stats, isLoading: statsLoading } = useTodayStats(userId);
  const position = useGeolocation(true);
  const {
    data: calls,
    isLoading,
    isError: callsError,
    refetch: refetchCalls,
  } = useOpenCalls(Boolean(rider) && rider?.verifyStatus === "APPROVED");
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다.
  const callsLoadFailed = callsError && calls === undefined;

  // [16 L3 §3-4] 정렬 토글 — 하루 수십 회 여는 최고빈도 표면의 탐색 효율. 세션 로컬 상태로 충분.
  const [sort, setSort] = useState<CallSort>("distance");

  // 좌표가 없는(비정상 데이터) 콜은 거리를 계산할 수 없다 — 목록 맨 뒤로 보낸다.
  const callDistanceKm = (call: { pickupLat: number | null; pickupLng: number | null }): number | null =>
    position && call.pickupLat != null && call.pickupLng != null
      ? distanceKm(position, { lat: call.pickupLat, lng: call.pickupLng })
      : null;

  const sortedCalls = (() => {
    const list = [...(calls ?? [])];
    switch (sort) {
      case "amount":
        // 예상 매입 지급액(스냅샷 시세×신청량 — CallCard와 동일 계산) 큰 순.
        return list.sort(
          (a, b) => estimateCash(b.requestedKg, b.snapshotPricePerKg) - estimateCash(a.requestedKg, a.snapshotPricePerKg),
        );
      case "recent":
        // 서버 조회가 이미 created_at desc — 그대로.
        return list;
      case "distance":
      default:
        // 위치를 모르면(권한 거부 등) 서버 순서(최신순) 유지 — 거리를 지어내지 않는다.
        if (!position) return list;
        return list.sort((a, b) => {
          const da = callDistanceKm(a);
          const db = callDistanceKm(b);
          if (da == null) return db == null ? 0 : 1;
          if (db == null) return -1;
          return da - db;
        });
    }
  })();

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
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
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
              flexShrink: 0,
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: rider?.isOnline ? "#fff" : colors.status.wait,
            }}
          />
          {rider?.isOnline ? "온라인" : "오프라인"}
        </button>
      </div>

      {/* [15] 온라인일 때만 "지금 무엇이 진행 중인가"를 한 줄로 축약한다.
          콜 수는 실제 조회 결과가 있을 때만 붙인다(로딩·실패 중엔 개수를 지어내지 않는다). */}
      {rider?.isOnline && (
        <div style={{ display: "flex" }}>
          <DynamicIsland>
            {isLoading || callsLoadFailed
              ? "콜 받는 중"
              : sortedCalls.length > 0
                ? `콜 받는 중 · 주변 ${sortedCalls.length}건`
                : "콜 받는 중 · 주변 콜 없음"}
          </DynamicIsland>
        </div>
      )}

      {/* 08 G6-④ "오늘 실적": 수거 kg + 지급 수단 분리(현금/포인트, completed_at 기준).
          쿠폰 잔액 히어로·소진 집계는 쿠폰 모델 폐기(08 P1)로 제거. */}
      <section data-testid="today-stats" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {statsLoading ? (
          // 로딩 중 0kg/0원이 먼저 떴다가 실제 값으로 교체되는 플래시 방지 스켈레톤.
          <div data-testid="today-stats-skeleton" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, height: 92, borderRadius: radius.card, backgroundColor: gray[100] }} />
            <div style={{ flex: 1, height: 92, borderRadius: radius.card, backgroundColor: gray[100] }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
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
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 6,
                borderRadius: radius.card,
                padding: 16,
                backgroundColor: surface.card,
                border: `1px solid ${surface.border}`,
                boxShadow: elevation.card,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>오늘 지급</p>
              <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 13, color: colors.status.wait }}>
                현금
                {/* 05 폴리시: 밝은 배경 위 앰버 "텍스트"는 accent.deep(대비 4.5:1) — 배경 앰버일 때만 흰 텍스트. */}
                <span data-testid="today-cash" className="oilpick-tabular-nums" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.deep }}>
                  {formatKrw(stats?.cashPaid ?? 0)}
                </span>
              </p>
              <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 13, color: colors.status.wait }}>
                포인트
                <span data-testid="today-point" className="oilpick-tabular-nums" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", color: colors.primary.dark }}>
                  {formatPoint(stats?.pointPaid ?? 0)}
                </span>
              </p>
            </div>
          </div>
        )}
      </section>

      {!rider?.isOnline && (
        <p data-testid="offline-notice" style={{ margin: 0, fontSize: 13, color: colors.status.wait, textAlign: "center" }}>
          온라인으로 전환하면 주변 콜을 받을 수 있어요.
        </p>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>주변 콜</h2>
          {/* [16 L3 §3-4] 정렬 세그먼트 — 표시 순서만 바꾼다(배차 규칙 불변, 13 D7). */}
          <div role="group" aria-label="콜 정렬" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(Object.keys(CALL_SORT_LABEL) as CallSort[]).map((key) => {
              const active = sort === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`call-sort-${key}`}
                  aria-pressed={active}
                  onClick={() => setSort(key)}
                  style={{
                    minHeight: 32,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? colors.primary.DEFAULT : surface.border}`,
                    backgroundColor: active ? colors.primary.light : surface.card,
                    color: active ? colors.primary.dark : colors.status.wait,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {CALL_SORT_LABEL[key]}
                </button>
              );
            })}
          </div>
        </div>
        {isLoading && (
          <div data-testid="open-calls-skeleton" style={{ height: 80, borderRadius: radius.card, backgroundColor: gray[100] }} />
        )}
        {/* 쿼리 실패는 "콜이 없어요"로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다. */}
        {!isLoading && callsLoadFailed && (
          <div data-testid="query-error">
            <EmptyState
              title="불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <button
                  type="button"
                  data-testid="query-error-retry"
                  onClick={() => refetchCalls()}
                  style={{
                    minHeight: 44,
                    padding: "0 20px",
                    borderRadius: radius.button,
                    border: `1px solid ${surface.border}`,
                    backgroundColor: surface.card,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  다시 시도
                </button>
              }
            />
          </div>
        )}
        {!isLoading && !callsLoadFailed && sortedCalls.length === 0 && (
          <EmptyState title="지금은 콜이 없어요" description="새 콜이 들어오면 알려드릴게요." />
        )}
        {/* 스태거 미적용: 이 목록은 위치정보 도착·Realtime 갱신 시 거리순 재정렬이 잦아
            keyed 재삽입마다 등장 모션이 재생돼 깜빡인다(2026-07-11 리뷰). 재정렬 없는
            목록(이력/알림 등)에만 .oilpick-stagger를 쓴다. */}
        {!isLoading && !callsLoadFailed && sortedCalls.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sortedCalls.map((call) => (
              <CallCard
                key={call.id}
                data-testid={`call-card-${call.id}`}
                distanceKm={callDistanceKm(call)}
                estimatedKg={call.requestedKg}
                estimatedCash={estimateCash(call.requestedKg, call.snapshotPricePerKg)}
                address={call.pickupAddress}
                onClick={() => navigate(`/calls/${call.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

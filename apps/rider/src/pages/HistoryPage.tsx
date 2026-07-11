import { useState } from "react";
import { EmptyState, InfoStatCard, StatusBadge, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useMonthlyPickupStats } from "../hooks/useTodayStats";
import { useRunHistory } from "../hooks/useRunHistory";

/**
 * 06 E9 — 운행 히스토리(/history). 본인 배정 완료/취소 주문 목록(created_at desc, 페이지네이션 —
 * apps/user OrdersHistoryPage.tsx 이전/다음 버튼 패턴) + 이번 달 합계 헤더(수거 건수·총 kg·현금
 * 지급 총액 — useMonthlyPickupStats 재사용, EarningsPage와 동일 집계 소스).
 * ⚠️ snapshot_rider_fee(구모델 수거비)는 표시 금지(07 D1) — 신모델 표기는 현금 지급/쿠폰 소진뿐.
 */
export function HistoryPage() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [page, setPage] = useState(0);

  const { data: monthly } = useMonthlyPickupStats(userId);
  const { data, isLoading, isError, refetch } = useRunHistory(userId, page);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && data === undefined;
  const items = data?.items ?? [];

  // 이력 페이지네이션 버튼과 같은 톤의 작은 outline 재시도 버튼.
  const retryButtonStyle = {
    minHeight: 44,
    padding: "0 20px",
    borderRadius: radius.button,
    border: `1px solid ${surface.border}`,
    backgroundColor: surface.card,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>운행 이력</h1>

      {/* 이번 달 합계 헤더. */}
      <div data-testid="run-history-month-summary">
        <InfoStatCard
          stats={[
            { label: "이번 달 수거", value: `${monthly?.count ?? 0}건` },
            { label: "수거량", value: formatKg(monthly?.kg ?? 0) },
            { label: "현금 지급", value: formatKrw(monthly?.cash ?? 0), accent: true },
          ]}
        />
      </div>

      {isLoading && (
        <div data-testid="run-history-skeleton" style={{ height: 200, borderRadius: radius.card, backgroundColor: gray[100] }} />
      )}

      {/* 쿼리 실패는 빈 상태로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다. */}
      {!isLoading && loadFailed && (
        <div data-testid="query-error">
          <EmptyState
            title="불러오지 못했어요"
            description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
            action={
              <button type="button" data-testid="query-error-retry" onClick={() => refetch()} style={retryButtonStyle}>
                다시 시도
              </button>
            }
          />
        </div>
      )}

      {!isLoading && !loadFailed && items.length === 0 && (
        <EmptyState title="운행 이력이 없어요" description="완료한 수거가 여기에 표시돼요." />
      )}

      {!isLoading && !loadFailed && items.length > 0 && (
        <ul data-testid="run-history-list" className="oilpick-stagger" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((order) => (
            <li
              key={order.id}
              data-testid="run-history-item"
              style={{
                border: `1px solid ${surface.border}`,
                borderRadius: radius.card,
                padding: 16,
                backgroundColor: surface.card,
                boxShadow: elevation.card,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: colors.status.wait }}>
                  {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                </span>
                <StatusBadge status={order.status} />
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: gray[900] }}>{order.pickupAddress}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: colors.status.wait }}>
                  {/* 취소 주문은 final_kg가 없다 — 확정 무게가 있을 때만 표기. */}
                  {order.finalKg != null && (
                    <span className="oilpick-tabular-nums" style={{ color: gray[900] }}>{formatKg(order.finalKg)}</span>
                  )}
                  {order.finalKg != null && order.couponCost != null && " · "}
                  {order.couponCost != null && `쿠폰 ${order.couponCost}장`}
                </span>
                {/* 07 D1: 수거비(snapshot_rider_fee) 대신 현장 지급 현금만 표기. */}
                {order.cashPaidAmount != null && (
                  <span className="oilpick-tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>
                    {formatKrw(order.cashPaidAmount)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !loadFailed && (items.length > 0 || page > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            type="button"
            data-testid="run-history-prev-page"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.button,
              border: `1px solid ${surface.border}`,
              backgroundColor: surface.card,
              cursor: page === 0 ? "not-allowed" : "pointer",
              opacity: page === 0 ? 0.4 : 1,
            }}
          >
            이전
          </button>
          <button
            type="button"
            data-testid="run-history-next-page"
            disabled={!data?.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.button,
              border: `1px solid ${surface.border}`,
              backgroundColor: surface.card,
              cursor: !data?.hasNextPage ? "not-allowed" : "pointer",
              opacity: !data?.hasNextPage ? 0.4 : 1,
            }}
          >
            다음
          </button>
        </div>
      )}
    </main>
  );
}

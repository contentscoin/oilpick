import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, PageHeader, StatusBadge, colors, gray, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useOrderHistory } from "../hooks/useOrderHistory";

/** U10 "/orders" 과거 수거 이력. 페이지네이션(간단한 쪽 — 04-tasks.md T8 DoD). */
export function OrdersHistoryPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, refetch } = useOrderHistory(userId, page);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && data === undefined;
  const items = data?.items ?? [];

  // 이력 목록 페이지네이션 버튼과 같은 톤의 작은 outline 재시도 버튼.
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
    <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <PageHeader title="수거 이력" onBack={() => navigate("/")} backTestId="orders-history-back" />

      {isLoading && (
        <div data-testid="orders-history-skeleton" style={{ height: 200, borderRadius: radius.card, backgroundColor: gray[100] }} />
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
        <EmptyState title="아직 수거 이력이 없어요" description="첫 수거 요청을 보내보세요." />
      )}

      {!isLoading && !loadFailed && items.length > 0 && (
        <ul data-testid="orders-history-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                data-testid="orders-history-item"
                onClick={() => navigate(`/orders/${order.id}`)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: `1px solid ${surface.border}`,
                  borderRadius: radius.card,
                  padding: 16,
                  backgroundColor: surface.card,
                  cursor: "pointer",
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>{formatKg(order.finalKg ?? order.requestedKg)}</span>
                  {/* 07 F9: 신모델 완료 주문은 현장 수령 현금. 레거시(supplier_point) 주문은 포인트 표기(레거시 렌더 분기). */}
                  {order.cashPaidAmount != null ? (
                    <span className="oilpick-tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>
                      {formatKrw(order.cashPaidAmount)}
                    </span>
                  ) : (
                    order.supplierPoint != null && (
                      <span className="oilpick-tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: colors.accent.deep }}>
                        {formatPoint(order.supplierPoint)}
                      </span>
                    )
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !loadFailed && (items.length > 0 || page > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            type="button"
            data-testid="orders-history-prev-page"
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
            data-testid="orders-history-next-page"
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

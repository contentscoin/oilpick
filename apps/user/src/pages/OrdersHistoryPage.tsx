import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, StatusBadge, colors, radius } from "@oilpick/ui";
import { formatKg, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useOrderHistory } from "../hooks/useOrderHistory";

/** U10 "/orders" 과거 수거 이력. 페이지네이션(간단한 쪽 — 04-tasks.md T8 DoD). */
export function OrdersHistoryPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const [page, setPage] = useState(0);

  const { data, isLoading } = useOrderHistory(userId, page);
  const items = data?.items ?? [];

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="orders-history-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>수거 이력</h1>
      </div>

      {isLoading && (
        <div data-testid="orders-history-skeleton" style={{ height: 200, borderRadius: radius.card, backgroundColor: "#f4f4f5" }} />
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState title="아직 수거 이력이 없어요" description="첫 수거 요청을 보내보세요." />
      )}

      {!isLoading && items.length > 0 && (
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
                  border: "1px solid #e4e4e7",
                  borderRadius: radius.card,
                  padding: 16,
                  backgroundColor: "#fff",
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
                  {order.supplierPoint != null && (
                    <span className="oilpick-tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: colors.accent.DEFAULT }}>
                      {formatPoint(order.supplierPoint)}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && (items.length > 0 || page > 0) && (
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
              border: "1px solid #e4e4e7",
              backgroundColor: "#fff",
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
              border: "1px solid #e4e4e7",
              backgroundColor: "#fff",
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

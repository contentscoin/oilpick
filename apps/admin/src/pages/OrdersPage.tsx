import { useState } from "react";
import { ORDER_STATUS_LABEL, formatKg, type OrderStatus } from "@oilpick/core";
import { useAdminOrderDetail, useAdminOrderEvents, useAdminOrders } from "../hooks/useOrdersAdmin";
import { OrderDetailDrawer } from "../components/OrderDetailDrawer";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "REQUESTED", label: ORDER_STATUS_LABEL.REQUESTED },
  { value: "ACCEPTED", label: ORDER_STATUS_LABEL.ACCEPTED },
  { value: "ARRIVED", label: ORDER_STATUS_LABEL.ARRIVED },
  { value: "PICKED_UP", label: ORDER_STATUS_LABEL.PICKED_UP },
  { value: "DELIVERED", label: ORDER_STATUS_LABEL.DELIVERED },
  { value: "COMPLETED", label: ORDER_STATUS_LABEL.COMPLETED },
  { value: "DISPUTED", label: ORDER_STATUS_LABEL.DISPUTED },
  { value: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

/**
 * 03-frontend.md apps/admin "/orders": "테이블(상태 필터) → 상세 드로어(이벤트 타임라인, 사진).
 * DISPUTED 건: RESOLVE_DISPUTE 폼(finalKg 입력). CANCEL 버튼".
 */
export function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data: orders, isLoading } = useAdminOrders(statusFilter);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">주문 관리</h1>
        <p className="text-sm text-zinc-500">주문 상태를 확인하고 분쟁을 중재해요.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === f.value ? "bg-primary text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
            data-testid={`status-filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="orders-table">
          <thead>
            <tr className="border-b border-zinc-100 text-zinc-500">
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">공급업체</th>
              <th className="px-4 py-3 font-medium">라이더</th>
              <th className="px-4 py-3 font-medium">예상/확정 kg</th>
              <th className="px-4 py-3 font-medium">주소</th>
              <th className="px-4 py-3 font-medium">생성일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  불러오는 중...
                </td>
              </tr>
            ) : orders && orders.length > 0 ? (
              orders.map((o) => (
                <tr key={o.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3">{o.supplierName}</td>
                  <td className="px-4 py-3">{o.riderName ?? "-"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {o.finalKg !== null ? `${formatKg(o.finalKg)} (확정)` : `${formatKg(o.requestedKg)} (예상)`}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-zinc-600">{o.pickupAddress}</td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(o.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(o.id)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      data-testid={`order-detail-button-${o.id}`}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  해당 상태의 주문이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedOrderId && (
        <OrderDetailDrawerContainer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const color =
    status === "COMPLETED" || status === "DELIVERED"
      ? "bg-primary-light text-primary"
      : status === "CANCELLED"
        ? "bg-status-danger/10 text-status-danger"
        : status === "DISPUTED"
          ? "bg-accent-light text-accent"
          : "bg-zinc-100 text-zinc-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

function OrderDetailDrawerContainer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: order, isLoading, refetch } = useAdminOrderDetail(orderId);
  const { data: events } = useAdminOrderEvents(orderId);

  return (
    <OrderDetailDrawer
      order={order ?? null}
      events={events ?? []}
      isLoading={isLoading}
      onClose={onClose}
      onMutated={refetch}
    />
  );
}

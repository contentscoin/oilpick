import { ORDER_STATUS_LABEL } from "@oilpick/core";
import type { OrderStatus } from "@oilpick/core";

/**
 * 주문 상태 pill — 05-design-upgrade.md 2026-07-10 폴리시.
 * 이전에는 OrdersPage/DashboardPage가 각자 인라인 매핑을 들고 있어 같은 상태가 화면마다
 * 다른 색으로 렌더됐다(대시보드는 상태 무관 항상 green). 상태→색 매핑의 단일 지점.
 */
export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const color =
    status === "COMPLETED" || status === "DELIVERED"
      ? "bg-primary-light text-primary"
      : status === "CANCELLED"
        ? "bg-status-danger/10 text-status-danger"
        : status === "DISPUTED"
          ? "bg-accent-light text-accent-deep"
          : status === "ACCEPTED" || status === "ARRIVED" || status === "PICKED_UP"
            ? "bg-status-active/10 text-status-active"
            : "bg-gray-100 text-gray-600";
  return <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${color}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

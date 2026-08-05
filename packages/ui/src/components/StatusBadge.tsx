import { ORDER_STATUS_LABEL, type OrderStatus } from "@oilpick/core";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — StatusBadge.
 * 주문 상태를 한글 라벨 + status 색상으로 표시하는 작은 배지.
 * 색상 매핑: REQUESTED/DISPUTED → wait, ACCEPTED~PICKED_UP → active,
 * DELIVERED/COMPLETED → done, CANCELLED → danger (00-domain.md 상태머신 기준).
 */
export interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  REQUESTED: colors.status.wait,
  ACCEPTED: colors.status.active,
  ARRIVED: colors.status.active,
  PICKED_UP: colors.status.active,
  DELIVERED: colors.status.done,
  COMPLETED: colors.status.done,
  CANCELLED: colors.status.danger,
  DISPUTED: colors.status.wait,
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className={className}
      data-testid="status-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 11px",
        borderRadius: radius.pill,
        fontSize: 13,
        fontWeight: 700,
        color,
        backgroundColor: `${color}1A`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, backgroundColor: color }}
      />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

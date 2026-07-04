import { ORDER_STATUS_LABEL, type OrderStatus } from "@oilpick/core";
import { colors, gray } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — OrderTimeline(상태 스텝퍼, 세로형).
 * 정상 진행 경로(00-domain.md 상태머신)만 스텝으로 표시한다. DISPUTED/CANCELLED는
 * currentStatus로 들어오면 별도 강조 스텝으로 치환 렌더한다(정상 경로에 끼워 넣지 않음).
 */
const HAPPY_PATH: OrderStatus[] = [
  "REQUESTED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "COMPLETED",
];

export interface OrderTimelineProps {
  currentStatus: OrderStatus;
  className?: string;
}

export function OrderTimeline({ currentStatus, className }: OrderTimelineProps) {
  const isExceptional = currentStatus === "CANCELLED" || currentStatus === "DISPUTED";
  const currentIndex = HAPPY_PATH.indexOf(currentStatus);

  if (isExceptional) {
    const color = currentStatus === "CANCELLED" ? colors.status.danger : colors.status.wait;
    return (
      <div className={className} data-testid="order-timeline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
        <span style={{ fontWeight: 600, color }}>{ORDER_STATUS_LABEL[currentStatus]}</span>
      </div>
    );
  }

  return (
    <ol
      className={className}
      data-testid="order-timeline"
      style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}
    >
      {HAPPY_PATH.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const color = done || active ? colors.primary.DEFAULT : colors.status.wait;
        return (
          <li key={step} style={{ display: "flex", gap: 12, minHeight: 44 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: done || active ? color : "#fff",
                  border: `2px solid ${color}`,
                  boxSizing: "border-box",
                }}
              />
              {i < HAPPY_PATH.length - 1 && (
                <span
                  aria-hidden
                  style={{
                    flex: 1,
                    width: 2,
                    backgroundColor: done ? colors.primary.DEFAULT : gray[200],
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontWeight: active ? 700 : 500,
                color: active ? colors.primary.DEFAULT : done ? "#111" : colors.status.wait,
                paddingBottom: 12,
              }}
            >
              {ORDER_STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import { ORDER_STATUS_LABEL, type OrderStatus } from "@oilpick/core";
import { colors, gray } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — OrderTimeline(상태 스텝퍼, 세로형).
 * 05-design-upgrade.md "OrderTimeline(진행 타임라인)": 완료 노드는 green 채움+체크,
 * 현재 노드는 green 링+정적 강조, 이후 노드는 zinc-300 빈 원. 노드 사이 연결선은
 * 완료 구간 green / 미완 구간 zinc-200.
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

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden fill="none">
      <path
        d="M2.5 6.2L5 8.7L9.5 3.7"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

  const green = colors.primary.DEFAULT;

  return (
    <ol
      className={className}
      data-testid="order-timeline"
      style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}
    >
      {HAPPY_PATH.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const isLast = i === HAPPY_PATH.length - 1;
        return (
          <li key={step} style={{ display: "flex", gap: 14, minHeight: 52 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  boxSizing: "border-box",
                  flexShrink: 0,
                  backgroundColor: done ? green : "#fff",
                  border: active
                    ? `2px solid ${green}`
                    : done
                      ? `2px solid ${green}`
                      : `2px solid ${gray[300]}`,
                  // 현재 노드는 green 링 + 은은한 후광으로 정적 강조.
                  boxShadow: active ? `0 0 0 4px ${green}22` : "none",
                }}
              >
                {done && <CheckIcon />}
                {active && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: green }} />
                )}
              </span>
              {!isLast && (
                <span
                  aria-hidden
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: 12,
                    backgroundColor: done ? green : gray[200],
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 16,
                fontWeight: active ? 700 : 500,
                color: active ? green : done ? gray[900] : colors.status.wait,
                paddingTop: 1,
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

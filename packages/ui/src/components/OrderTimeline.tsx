import { ORDER_STATUS_LABEL, type OrderStatus } from "@oilpick/core";
import { colors, gray, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — OrderTimeline(상태 스텝퍼, 세로형).
 * 05-design-upgrade.md "OrderTimeline(진행 타임라인)": 완료 노드는 green 채움+체크,
 * 현재 노드는 green 링+정적 강조, 이후 노드는 zinc-300 빈 원. 노드 사이 연결선은
 * 완료 구간 green / 미완 구간 zinc-200.
 * 정상 진행 경로(00-domain.md 상태머신)만 스텝으로 표시한다. DISPUTED/CANCELLED는
 * currentStatus로 들어오면 별도 강조 스텝으로 치환 렌더한다(정상 경로에 끼워 넣지 않음).
 *
 * 07 F9-⑦: 신 상태머신은 ARRIVED→COMPLETED 직행(현금 2자 확인)으로 PICKED_UP/DELIVERED를
 * 생략한다. 신규 주문은 4스텝 HAPPY_PATH를 쓰고, 레거시 주문(picked_up_at/delivered_at 존재 →
 * `legacy` prop 또는 currentStatus가 PICKED_UP/DELIVERED)만 구경로 5스텝을 조건부 렌더한다.
 */
const HAPPY_PATH: OrderStatus[] = ["REQUESTED", "ACCEPTED", "ARRIVED", "COMPLETED"];

/** 레거시(구모델) 경로 — 프로덕션 잔존 주문 완결용. PICKED_UP 단계 포함. 07 §1-3 레거시 전이. */
const LEGACY_PATH: OrderStatus[] = ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP", "COMPLETED"];

export interface OrderTimelineProps {
  currentStatus: OrderStatus;
  /**
   * 각 스텝 우측에 정렬 표시할 시각(포맷된 문자열, 예 "오늘 14:05").
   * 완료/현재 스텝은 실제 시각, 현재 스텝 시각은 green, 미래 스텝은 "-".
   * 미전달 시 시각 컬럼을 아예 렌더하지 않아 기존 사용처 무영향.
   */
  timestamps?: Partial<Record<OrderStatus, string>>;
  /**
   * 07 F9-⑦: 레거시 주문(picked_up_at/delivered_at 존재)이면 true. 구경로 5스텝을 렌더한다.
   * currentStatus가 PICKED_UP/DELIVERED면(신규 주문은 도달 불가) 자동으로 레거시로 간주한다.
   */
  legacy?: boolean;
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

export function OrderTimeline({ currentStatus, timestamps, legacy, className }: OrderTimelineProps) {
  const isExceptional = currentStatus === "CANCELLED" || currentStatus === "DISPUTED";
  // 신규 주문은 PICKED_UP/DELIVERED에 도달할 수 없으므로, 그 상태가 들어오면 레거시 주문으로 간주.
  const isLegacy = legacy || currentStatus === "PICKED_UP" || currentStatus === "DELIVERED";
  const path = isLegacy ? LEGACY_PATH : HAPPY_PATH;
  const currentIndex = path.indexOf(currentStatus);
  /**
   * "여기까지 완료"의 마지막 인덱스. 보통은 현재 스텝 직전이다.
   * 레거시 DELIVERED(07 §1-3 구전이 PICKED_UP→DELIVERED→COMPLETED)는 스텝으로 렌더하지
   * 않는 중간 상태라 path.indexOf가 -1이 된다 — 그대로 두면 완료 구간이 통째로 미완으로
   * 보인다(상태 pill을 붙이면서 드러난 기존 결함). 진행도만 PICKED_UP 완료로 읽는다.
   */
  const doneThrough =
    currentIndex >= 0 ? currentIndex - 1 : currentStatus === "DELIVERED" ? path.indexOf("PICKED_UP") : -1;
  /** 종결 주문 — 마지막 스텝을 "현재 진행 중"이 아니라 "완료"로 그린다. */
  const finished = currentStatus === "COMPLETED";

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
      {path.map((step, i) => {
        // 마지막 스텝(COMPLETED)에 도달한 주문은 "진행 중"이 아니라 끝난 것이다 — 노드도 체크로 채운다.
        const done = i <= doneThrough || (finished && i === currentIndex);
        const active = i === currentIndex && !finished;
        const isLast = i === path.length - 1;
        const stateLabel = active ? "진행 중" : done ? "완료됨" : "예정";
        // 도달한 COMPLETED 스텝은 라벨("완료")이 이미 종결을 말한다 — "완료 완료됨"으로 겹쳐 쓰지
        // 않는다. 아직 도달 전이면 "완료 [예정]"이라 겹치지 않으므로 그대로 붙인다.
        const showStatePill = !(done && step === "COMPLETED");
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
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingTop: 1,
                paddingBottom: 12,
              }}
            >
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: active ? 700 : 500,
                    color: active ? green : done ? gray[900] : colors.status.wait,
                  }}
                >
                  {ORDER_STATUS_LABEL[step]}
                </span>
                {timestamps && (done || active) && (
                  <span
                    data-testid={`order-timeline-time-${step}`}
                    className="oilpick-tabular-nums"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      // 시각은 라벨의 보조 정보로 아래에 붙는다(목업 time-row의 small 자리).
                      // 아직 오지 않은 스텝에는 아예 렌더하지 않는다 — 라벨 밑에 "-"만 덩그러니
                      // 남아 오타처럼 보였다. 미래라는 사실은 "예정" pill이 이미 말한다.
                      color: timestamps[step] ? colors.status.wait : gray[400],
                    }}
                  >
                    {timestamps[step] ?? "-"}
                  </span>
                )}
              </span>
              {/* [15] 목업 04 추적 time-row의 완료/진행/다음 pill. 예전엔 우측이 시각 하나뿐이라
                  "지금 어디까지 왔는가"를 점 색깔로만 읽어야 했다 — 글자로도 말해준다. */}
              {showStatePill && (
                <span
                  data-testid={`order-timeline-state-${step}`}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 26,
                    padding: "0 10px",
                    borderRadius: radius.pill,
                    fontSize: 12,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    ...(active
                      ? { backgroundColor: colors.lime.soft, color: colors.primary.dark }
                      : done
                        ? { backgroundColor: colors.primary.light, color: colors.primary.dark }
                        : { border: `1px solid ${gray[200]}`, color: gray[400] }),
                  }}
                >
                  {stateLabel}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

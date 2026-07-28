import { colors, gray, radius, surface } from "../tokens";

/**
 * 15-motion-design.md — 현장 절차의 남은 단계를 보여주는 체크 목록(라이더 운행 화면).
 * OrderTimeline이 *주문 상태*(서버가 소유)를 그린다면, CheckList는 *현장 행동 순서*를 그린다.
 * 상태머신과 무관한 표시 전용 컴포넌트다.
 *
 * 상태는 아이콘·라벨·pill 텍스트 세 겹으로 전달한다(색만으로 알리지 않는다).
 */
export type CheckState = "done" | "current" | "todo";

export interface CheckItem {
  label: string;
  state: CheckState;
  /** 우측 pill 문구. 기본은 상태별 한글 라벨. */
  hint?: string;
}

const DEFAULT_HINT: Record<CheckState, string> = {
  done: "완료",
  current: "진행 중",
  todo: "대기",
};

function Glyph({ state }: { state: CheckState }) {
  if (state === "done") {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden fill="none">
        <path
          d="M3.5 8.4l3 3 6-6.4"
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden fill="none">
        <circle cx={8} cy={8} r={3.2} fill="#FFFFFF" />
      </svg>
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden fill="none">
      <circle cx={8} cy={8} r={3.2} stroke={gray[500]} strokeWidth={1.6} />
    </svg>
  );
}

export interface CheckListProps {
  items: CheckItem[];
  className?: string;
}

export function CheckList({ items, className }: CheckListProps) {
  return (
    <ul
      data-testid="check-list"
      className={className}
      style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}
    >
      {items.map((item) => {
        const dotBg =
          item.state === "done"
            ? colors.primary.DEFAULT
            : item.state === "current"
              ? colors.status.active
              : gray[200];
        return (
          <li
            key={item.label}
            data-testid="check-row"
            data-state={item.state}
            style={{
              minHeight: 48,
              display: "grid",
              gridTemplateColumns: "28px 1fr auto",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: radius.button,
              border: `1px solid ${surface.border}`,
              backgroundColor: surface.card,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                backgroundColor: dotBg,
              }}
            >
              <Glyph state={item.state} />
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: item.state === "todo" ? 600 : 800,
                color: item.state === "todo" ? gray[500] : gray[900],
                wordBreak: "keep-all",
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                minHeight: 26,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 10px",
                borderRadius: radius.pill,
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: "nowrap",
                backgroundColor:
                  item.state === "current" ? "#EAF2FF" : item.state === "done" ? colors.primary.light : gray[100],
                color:
                  item.state === "current"
                    ? "#1D4ED8"
                    : item.state === "done"
                      ? colors.primary.dark
                      : gray[500],
              }}
            >
              {item.hint ?? DEFAULT_HINT[item.state]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import type { ReactNode } from "react";
import { colors, gray } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — EmptyState(빈 상태 화면).
 * 05-design-upgrade.md "EmptyState": 아이콘(단색 라인) + 제목 + 한 줄 설명. 세로 중앙,
 * 상하 여백 넉넉히 하되 화면을 통째로 비우지 말 것(최대폭 제한). icon 미지정 시 기본 라인 아이콘.
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** 상단 아이콘(선택). 미지정 시 기본 라인 아이콘을 렌더. null이면 아이콘 생략. */
  icon?: ReactNode;
  className?: string;
}

/** 기본 라인 아이콘(빈 문서/트레이 톤). 단색 라인, 기존 커스텀 아이콘 톤. */
function DefaultEmptyIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5L6 5h12l2 3.5M4 8.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8.5M4 8.5h5l1.2 2h3.6l1.2-2H20"
        stroke={gray[400]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  const iconNode = icon === undefined ? <DefaultEmptyIcon /> : icon;
  return (
    <div
      data-testid="empty-state"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "40px 24px",
        gap: 10,
        maxWidth: 320,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {iconNode && (
        <div
          data-testid="empty-state-icon"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            marginBottom: 4,
            borderRadius: "50%",
            backgroundColor: gray[100],
          }}
        >
          {iconNode}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: gray[900] }}>{title}</p>
      {description && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: colors.status.wait }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

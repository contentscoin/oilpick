import type { ReactNode } from "react";
import { colors, gray } from "../tokens";

/**
 * 06-enhancement-plan.md E2 — 로드 실패/404 공용 화면. EmptyState와 톤은 비슷하나 의미가
 * 다르다(빈 상태가 아니라 오류·막다른 길). 라우팅에 의존하지 않도록 순수 표현 컴포넌트로 두고,
 * 복귀 버튼([뒤로가기]/[홈으로])은 앱이 `action`으로 주입한다(packages/ui는 react-router 비의존).
 */
export interface ErrorScreenProps {
  /** 기본값 "문제가 발생했어요". OrderDetailPage 등 특정 문구가 필요하면 그대로 넘긴다. */
  title?: string;
  description?: string;
  /** 상단 아이콘(선택). 미지정 시 기본 경고 아이콘. null이면 아이콘 생략. */
  icon?: ReactNode;
  /** 복귀 버튼 등(선택). 세로 스택으로 렌더. */
  action?: ReactNode;
  className?: string;
}

/** 기본 경고 아이콘(원 안 느낌표). 단색 라인, EmptyState 톤과 통일. */
function DefaultErrorIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke={colors.status.wait} strokeWidth={1.5} />
      <path d="M12 7.5v5.5" stroke={colors.status.wait} strokeWidth={1.7} strokeLinecap="round" />
      <circle cx={12} cy={16.3} r={1} fill={colors.status.wait} />
    </svg>
  );
}

export function ErrorScreen({ title = "문제가 발생했어요", description, icon, action, className }: ErrorScreenProps) {
  const iconNode = icon === undefined ? <DefaultErrorIcon /> : icon;
  return (
    <div
      data-testid="error-screen"
      role="alert"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 10,
        maxWidth: 320,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {iconNode && (
        <div
          data-testid="error-screen-icon"
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
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: colors.status.wait }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>{action}</div>}
    </div>
  );
}

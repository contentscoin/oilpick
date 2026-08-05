import { colors } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — Toast.
 * "네트워크 오류 공통 토스트 + 재시도"(공통 규칙 절)에 쓰이는 단발성 알림 표시 컴포넌트.
 * 큐/타이머 관리는 앱(또는 상위 훅)의 책임 — 이 컴포넌트는 순수 표시 + 선택적 재시도 버튼만 담당.
 */
export interface ToastProps {
  message: string;
  variant?: "info" | "success" | "error";
  onRetry?: () => void;
  className?: string;
}

const VARIANT_COLOR: Record<NonNullable<ToastProps["variant"]>, string> = {
  info: colors.status.active,
  success: colors.status.done,
  error: colors.status.danger,
};

export function Toast({ message, variant = "info", onRetry, className }: ToastProps) {
  return (
    <div
      role="status"
      data-testid="toast"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        backgroundColor: "#27272a",
        color: "#fff",
        borderLeft: `4px solid ${VARIANT_COLOR[variant]}`,
      }}
    >
      <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          data-testid="toast-retry"
          onClick={onRetry}
          style={{
            background: "none",
            border: "none",
            color: colors.accent.DEFAULT,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            // [03 레이아웃 강건성] 확대 시 버튼이 눌려 "재/시도"로 쪼개지지 않게.
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          재시도
        </button>
      )}
    </div>
  );
}

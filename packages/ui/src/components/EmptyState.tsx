import type { ReactNode } from "react";
import { colors } from "../tokens";

/** 03-frontend.md "packages/ui 컴포넌트" — EmptyState(빈 상태 화면). */
export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 8,
      }}
    >
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</p>
      {description && (
        <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

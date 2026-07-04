import type { ReactNode } from "react";
import { radius } from "../tokens";

/** 03-frontend.md "packages/ui 컴포넌트" — BottomSheet. */
export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div
      data-testid="bottom-sheet-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="bottom-sheet"
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          backgroundColor: "#fff",
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div
          aria-hidden
          style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e4e4e7", margin: "0 auto 16px" }}
        />
        {title && <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

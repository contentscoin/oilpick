import { useEffect, useState, type ReactNode } from "react";
import { motion, radius, surface } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/** 03-frontend.md "packages/ui 컴포넌트" — BottomSheet. */
export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 05-design-upgrade.md 2026-07-10 폴리시: 시트 어포던스 — 백드롭 페이드 + 시트 슬라이드업.
 * open 직후 한 프레임 뒤에 enter 상태로 전환해 CSS transition을 태운다(mount 시점엔
 * translateY(100%)/opacity 0). prefers-reduced-motion이면 즉시 표시(트랜지션 생략).
 * 닫힘은 기존 그대로 즉시 unmount — 상태 정리를 지연시키지 않는다(호출부 계약 불변).
 */
export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const reduce = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    if (reduce) {
      setEntered(true);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open, reduce]);

  if (!open) return null;
  const shown = entered || reduce;
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
        opacity: shown ? 1 : 0,
        transition: reduce ? undefined : `opacity ${motion.base} ${motion.ease}`,
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
          backgroundColor: surface.card,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: 20,
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "80vh",
          overflowY: "auto",
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: reduce ? undefined : `transform ${motion.base} ${motion.ease}`,
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

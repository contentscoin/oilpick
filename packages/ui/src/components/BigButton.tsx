import type { ButtonHTMLAttributes } from "react";
import { colors, radius } from "../tokens";

/** 03-frontend.md "packages/ui 컴포넌트" — BigButton(높이 56px CTA). */
export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}

const VARIANT_STYLE: Record<NonNullable<BigButtonProps["variant"]>, { bg: string; fg: string }> = {
  primary: { bg: colors.primary.DEFAULT, fg: "#fff" },
  secondary: { bg: colors.primary.light, fg: colors.primary.dark },
  danger: { bg: colors.status.danger, fg: "#fff" },
};

export function BigButton({
  variant = "primary",
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: BigButtonProps) {
  const { bg, fg } = VARIANT_STYLE[variant];
  return (
    <button
      type="button"
      data-testid="big-button"
      disabled={disabled || loading}
      style={{
        height: 56,
        width: "100%",
        borderRadius: radius.button,
        border: "none",
        backgroundColor: bg,
        color: fg,
        fontSize: 16,
        fontWeight: 700,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.6 : 1,
        ...style,
      }}
      {...rest}
    >
      {loading ? "처리 중..." : children}
    </button>
  );
}

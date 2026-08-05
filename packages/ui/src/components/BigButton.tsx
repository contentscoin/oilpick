import type { ButtonHTMLAttributes } from "react";
import { colors, elevation, radius } from "../tokens";
import { cx } from "../cx";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — BigButton(높이 56px CTA).
 * 05-design-upgrade.md "버튼/입력": green 유지 + shadow-card, active 시 살짝 눌림(scale .99).
 * secondary는 아웃라인. 눌림/호버는 styles.css의 .oilpick-big-button에서 처리.
 */
export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}

const VARIANT_STYLE: Record<
  NonNullable<BigButtonProps["variant"]>,
  { bg: string; fg: string; border: string; shadow: string }
> = {
  primary: { bg: colors.primary.DEFAULT, fg: "#fff", border: "none", shadow: elevation.card },
  // 보조 버튼: 아웃라인.
  secondary: {
    bg: "#fff",
    fg: colors.primary.DEFAULT,
    border: `1.5px solid ${colors.primary.DEFAULT}`,
    shadow: "none",
  },
  danger: { bg: colors.status.danger, fg: "#fff", border: "none", shadow: elevation.card },
};

export function BigButton({
  variant = "primary",
  loading = false,
  disabled,
  children,
  style,
  className,
  ...rest
}: BigButtonProps) {
  const { bg, fg, border, shadow } = VARIANT_STYLE[variant];
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      data-testid="big-button"
      className={cx("oilpick-big-button", className)}
      disabled={isDisabled}
      style={{
        // [03 레이아웃 강건성] 고정 height 금지 — 글자 확대(textZoom) 시 라벨이 잘리지 않게
        // minHeight+세로 padding으로 확보한다(1x에서는 기존 56px 그대로).
        minHeight: 56,
        padding: "10px 16px",
        width: "100%",
        borderRadius: radius.button,
        border,
        backgroundColor: bg,
        color: fg,
        fontSize: 16,
        fontWeight: 700,
        boxShadow: isDisabled ? "none" : shadow,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        ...style,
      }}
      {...rest}
    >
      {loading ? "처리 중..." : children}
    </button>
  );
}

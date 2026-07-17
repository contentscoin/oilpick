import { PAYOUT_METHOD_LABEL, type PayoutMethod } from "@oilpick/core";
import { colors, radius, typeScale } from "../tokens";

/**
 * 08-payout-pivot.md G4-③ — 현장 지급수단 뱃지(현금/포인트).
 * 주문 카드/상세/관리자 드로어 공용. CASH=브랜드 그린 틴트, POINT=딥앰버 틴트
 * (accent.deep — 밝은 배경 위 4.5:1 대비, 05 폴리시).
 * method가 null/undefined(계량 제출 전·레거시)면 렌더하지 않는다.
 */
export interface PayoutMethodChipProps {
  method: PayoutMethod | null | undefined;
  className?: string;
}

const STYLE: Record<PayoutMethod, { bg: string; fg: string }> = {
  CASH: { bg: colors.primary.light, fg: colors.primary.dark },
  POINT: { bg: colors.accent.light, fg: colors.accent.deep },
};

export function PayoutMethodChip({ method, className }: PayoutMethodChipProps) {
  if (!method) return null;
  const style = STYLE[method];
  return (
    <span
      data-testid="payout-method-chip"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: radius.pill,
        backgroundColor: style.bg,
        color: style.fg,
        fontSize: typeScale.caption,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {method === "CASH" ? "💵" : "🪙"} {PAYOUT_METHOD_LABEL[method]}
    </span>
  );
}

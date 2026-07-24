import { estimateKg, formatKg, KG_PER_CAN } from "@oilpick/core";
import { colors, elevation } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — QtyStepper(통 수량 스테퍼).
 * U3 홈/U5 요청 스텝에서 수량 입력에 쓰인다. onChange는 항상 통 수(정수)를 전달하고,
 * "통" 입력을 estimateKg로 kg 환산해 보조 표기한다(00-domain.md "계량/수량 규칙" —
 * 실제 확정 kg은 현장 계량 기준이라 이 컴포넌트는 예상치 표시 전용).
 * [12 §6] 통/kg 토글 제거 — 수거신청은 통 개수만 선택한다. max 기본값은 스키마 상한
 * (requestedKg ≤ 500)에 맞춰 33통(33×15=495kg)으로 클램프.
 */
export interface QtyStepperProps {
  value: number;
  onChange: (cans: number) => void;
  min?: number;
  max?: number;
  className?: string;
  /**
   * [14 J2] 값 아래 보조 표기. undefined=기본 kg 환산(폐유 통수), null=표기 없음,
   * 문자열=대체 문구(신유 구매 통수엔 kg 환산 대신 통당가 등을 넣는다).
   */
  subLabel?: string | null;
}

export function QtyStepper({ value, onChange, min = 1, max = 33, className, subLabel }: QtyStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={className} data-testid="qty-stepper">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <button
          type="button"
          aria-label="수량 감소"
          data-testid="qty-stepper-decrement"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: `1.5px solid ${colors.primary.DEFAULT}`,
            backgroundColor: "#fff",
            color: colors.primary.DEFAULT,
            fontSize: 22,
            fontWeight: 700,
            boxShadow: value <= min ? "none" : elevation.card,
            cursor: value <= min ? "not-allowed" : "pointer",
            opacity: value <= min ? 0.4 : 1,
          }}
        >
          −
        </button>
        <div style={{ textAlign: "center", minWidth: 112 }}>
          <p
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 32, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.01em" }}
          >
            {value}통
          </p>
          {subLabel === undefined ? (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }} data-testid="qty-stepper-kg">
              약 {formatKg(estimateKg(value))} (통당 {KG_PER_CAN}kg)
            </p>
          ) : subLabel === null ? null : (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }} data-testid="qty-stepper-sublabel">
              {subLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="수량 증가"
          data-testid="qty-stepper-increment"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: `1.5px solid ${colors.primary.DEFAULT}`,
            backgroundColor: colors.primary.DEFAULT,
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            boxShadow: value >= max ? "none" : elevation.card,
            cursor: value >= max ? "not-allowed" : "pointer",
            opacity: value >= max ? 0.4 : 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

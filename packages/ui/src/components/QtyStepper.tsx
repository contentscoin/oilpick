import { useState } from "react";
import { estimateKg, formatKg, KG_PER_CAN } from "@oilpick/core";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — QtyStepper(통/kg 토글).
 * U3 홈/U5 요청 스텝에서 수량 입력에 쓰인다. "통" 단위 입력을 estimateKg로 kg 환산해
 * 보조 표기하며, onChange는 항상 통 수(정수)를 전달한다(00-domain.md "계량/수량 규칙" —
 * 실제 확정 kg은 현장 계량 기준이라 이 컴포넌트는 예상치 표시 전용).
 */
export interface QtyStepperProps {
  value: number;
  onChange: (cans: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function QtyStepper({ value, onChange, min = 1, max = 99, className }: QtyStepperProps) {
  const [unit, setUnit] = useState<"can" | "kg">("can");
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={className} data-testid="qty-stepper">
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {(["can", "kg"] as const).map((u) => (
          <button
            key={u}
            type="button"
            data-testid={`qty-stepper-unit-${u}`}
            onClick={() => setUnit(u)}
            aria-pressed={unit === u}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radius.button,
              border: `1px solid ${unit === u ? colors.primary.DEFAULT : "#e4e4e7"}`,
              backgroundColor: unit === u ? colors.primary.light : "#fff",
              color: unit === u ? colors.primary.dark : "#333",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {u === "can" ? "통" : "kg"}
          </button>
        ))}
      </div>
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
            border: `1px solid ${colors.primary.DEFAULT}`,
            backgroundColor: "#fff",
            fontSize: 20,
            cursor: value <= min ? "not-allowed" : "pointer",
            opacity: value <= min ? 0.4 : 1,
          }}
        >
          −
        </button>
        <div style={{ textAlign: "center", minWidth: 96 }}>
          <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            {value}통
          </p>
          <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }} data-testid="qty-stepper-kg">
            약 {formatKg(estimateKg(value))} (통당 {KG_PER_CAN}kg)
          </p>
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
            border: `1px solid ${colors.primary.DEFAULT}`,
            backgroundColor: colors.primary.DEFAULT,
            color: "#fff",
            fontSize: 20,
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

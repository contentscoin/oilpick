import { useId, type ChangeEvent } from "react";
import { colors, gray, radius, surface } from "../tokens";

/**
 * 15-motion-design.md — 휴대폰 인증번호 입력(자리별 슬롯).
 *
 * 슬롯을 input 여러 개로 쪼개면 SMS 자동완성·붙여넣기·백스페이스가 전부 깨진다.
 * 그래서 **실제 입력은 투명한 input 하나**가 받고, 슬롯은 그 값을 그리기만 한다
 * (`autoComplete="one-time-code"`로 iOS/Android SMS 자동입력이 그대로 동작).
 *
 * 오류는 흔들림 + 경계색 + 메시지 세 겹으로 알린다(색만으로 알리지 않는다).
 * 흔들림은 error가 false→true로 바뀔 때 한 번 재생되며, reduced-motion에서는 정지한다.
 */
export interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  /** 자리 수. 기본 6. */
  length?: number;
  /** true면 슬롯 경계가 붉어지고 한 번 흔들린다. */
  error?: boolean;
  /** 오류 메시지(있으면 슬롯 아래에 표시되고 input에 연결된다). */
  errorMessage?: string;
  /** 스크린리더용 라벨. 기본 "인증번호". */
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** 실제 input의 data-testid. 기존 화면 테스트가 쓰던 id를 그대로 유지할 때 넘긴다. */
  inputTestId?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  error = false,
  errorMessage,
  label = "인증번호",
  disabled = false,
  autoFocus = false,
  inputTestId = "otp-field",
}: OtpInputProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // 숫자만 남기고 길이를 자른다(붙여넣기 대응).
    const digits = e.target.value.replace(/\D/g, "").slice(0, length);
    onChange(digits);
  };

  const slots = Array.from({ length }, (_, i) => value[i] ?? "");
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div data-testid="otp-input">
      <div style={{ position: "relative" }}>
        <div
          aria-hidden="true"
          data-testid="otp-slots"
          className={error ? "oilpick-shake" : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${length}, 1fr)`,
            gap: 8,
          }}
        >
          {slots.map((char, i) => {
            const isActive = !disabled && i === activeIndex && value.length < length;
            const borderColor = error ? colors.status.danger : isActive ? colors.primary.DEFAULT : gray[300];
            return (
              <div
                key={i}
                data-testid="otp-slot"
                data-filled={char ? "true" : "false"}
                style={{
                  aspectRatio: "1",
                  minHeight: 48,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: radius.button,
                  border: `1.5px solid ${borderColor}`,
                  backgroundColor: surface.card,
                  boxShadow: isActive ? `0 0 0 4px ${colors.primary.light}` : undefined,
                  fontSize: 20,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color: gray[900],
                }}
              >
                {char}
              </div>
            );
          })}
        </div>
        {/* 실제 입력 — 슬롯 위를 덮는 투명 input. 포커스 링은 슬롯이 대신 그린다. */}
        <input
          id={inputId}
          data-testid={inputTestId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          aria-invalid={error || undefined}
          aria-describedby={error && errorMessage ? errorId : undefined}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={length}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            // 캐럿이 슬롯 위에 겹쳐 보이지 않도록.
            caretColor: "transparent",
            border: 0,
            padding: 0,
            background: "transparent",
            fontSize: 16, // iOS 자동 확대 방지(16px 미만 금지)
          }}
        />
      </div>
      {error && errorMessage && (
        <p
          id={errorId}
          data-testid="otp-error"
          role="alert"
          style={{ margin: "10px 0 0", fontSize: 13, color: colors.status.danger, wordBreak: "keep-all" }}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

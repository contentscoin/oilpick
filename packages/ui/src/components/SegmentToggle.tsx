import { useRef } from "react";
import { colors, elevation, gray, motion, radius, surface, touchTarget } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * 07-pivot-plan.md F7-⑤ — 범용 세그먼트 컨트롤.
 * radius.pill 트랙 + 슬라이딩 인디케이터(transform 200ms), 선택 700 웨이트, 터치 타깃 48px.
 * 기간(7/30/90일) 토글이 첫 소비처지만 옵션 배열을 받는 범용 컴포넌트로 둔다.
 * 접근성: role="radiogroup" + roving tabindex + 좌우/상하 화살표 이동.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentToggleProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 그룹 aria-label(예: "기간 선택"). */
  ariaLabel?: string;
  className?: string;
}

const SLIDE_MS = 200;
const TRACK_PAD = 4;

export function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentToggleProps<T>) {
  const reduce = usePrefersReducedMotion();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function moveFocus(nextIndex: number) {
    const clamped = (nextIndex + count) % count;
    const opt = options[clamped];
    if (!opt) return;
    onChange(opt.value);
    buttonsRef.current[clamped]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(count - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      className={className}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid="segment-toggle"
      style={{
        position: "relative",
        display: "flex",
        padding: TRACK_PAD,
        backgroundColor: gray[100],
        borderRadius: radius.pill,
      }}
    >
      {/* 슬라이딩 인디케이터(선택 세그먼트 아래 흰 pill). */}
      <div
        aria-hidden
        data-testid="segment-indicator"
        style={{
          position: "absolute",
          top: TRACK_PAD,
          bottom: TRACK_PAD,
          left: TRACK_PAD,
          width: `calc((100% - ${TRACK_PAD * 2}px) / ${count})`,
          transform: `translateX(${activeIndex * 100}%)`,
          transition: reduce ? "none" : `transform ${SLIDE_MS}ms ${motion.ease}`,
          backgroundColor: surface.card,
          borderRadius: radius.pill,
          boxShadow: elevation.card,
        }}
      />
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-testid={`segment-option-${option.value}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              // [03 레이아웃 강건성] minWidth:0 — 글자 확대 시 라벨이 트랙을 밀어내
              // 인디케이터 폭 계산식(100%/count)과 어긋나는 것을 완화한다.
              minWidth: 0,
              minHeight: touchTarget,
              border: "none",
              background: "transparent",
              borderRadius: radius.pill,
              fontSize: 14,
              fontWeight: selected ? 700 : 500,
              color: selected ? colors.primary.dark : gray[500],
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

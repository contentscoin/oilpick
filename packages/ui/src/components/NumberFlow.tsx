import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion as motionTokens, numericFontVariant } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * 15-motion-design.md — 값이 *바뀌었다는 사실*을 말하는 숫자.
 * 통 수를 바꾸면 예상 수령액이 굴러가듯 갱신되고, 계량이 확정되면 최종 지급액이 카운트업한다.
 *
 * 접근성: 애니메이션 중간값은 표시 전용이라 `aria-hidden`이고, 접근성 트리에는 항상
 * **최종값만** 노출한다(15 원칙 4). reduced-motion에서는 중간 프레임 없이 즉시 최종값.
 */
export interface NumberFlowProps {
  /** 표시할 최종 값. 바뀌면 이전 표시값에서 이 값까지 보간한다. */
  value: number;
  /** 표시 포맷터. 기본은 정수 + 천단위 콤마(ko-KR). */
  format?: (n: number) => string;
  /** 보간 시간(ms). 기본 tokens.motion.count(900ms). */
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
  /** 바깥 span의 data-testid. 기존 화면 테스트가 쓰던 id를 유지할 때 넘긴다. */
  testId?: string;
}

const DEFAULT_DURATION = Number.parseInt(motionTokens.count, 10);

function defaultFormat(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export function NumberFlow({
  value,
  format = defaultFormat,
  durationMs = DEFAULT_DURATION,
  className,
  style,
  testId = "number-flow",
}: NumberFlowProps) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  // 현재 화면에 그려진 값. 애니메이션 도중 value가 또 바뀌어도 "보이던 값"에서 이어가도록
  // state가 아니라 ref로 따로 추적한다(state는 다음 렌더까지 반영이 늦다).
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const from = displayRef.current;
    if (from === value) return;
    // rAF가 없는 환경(구형 jsdom 등)에서는 모션을 포기하고 최종값으로 간다.
    if (typeof requestAnimationFrame !== "function") {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        displayRef.current = value;
        setDisplay(value);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [value, durationMs, reduce]);

  return (
    <span className={className} data-testid={testId} style={{ ...numericFontVariant, ...style }}>
      {/* 보이는 쪽은 보간 중간값 — 접근성 트리에서는 제외한다. */}
      <span aria-hidden="true" data-testid="number-flow-visual">
        {format(display)}
      </span>
      {/* 스크린리더가 읽는 쪽은 언제나 최종값(15 원칙 4). generic 요소의 aria-label은
          노출이 보장되지 않으므로 시각적으로만 숨긴 실제 텍스트를 둔다. */}
      <span className="oilpick-sr-only" data-testid="number-flow-a11y">
        {format(value)}
      </span>
    </span>
  );
}

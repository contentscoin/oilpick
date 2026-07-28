import { colors } from "../tokens";

/**
 * 15-motion-design.md — "실시간 갱신 중"을 나타내는 작은 도트.
 * DynamicIsland·체크리스트 등에서 공유. 색은 다크/밝은 배경에 따라 호출부가 정한다
 * (라임·시안은 **다크 배경 전용** — 10-brand.md B7).
 *
 * 글로우는 `currentColor` 기반이라 color만 바꾸면 링 색도 따라간다.
 * reduced-motion에서는 styles.css가 애니메이션을 끄고 도트는 그대로 남는다(정보 유지).
 */
export interface LiveDotProps {
  /** 도트 색. 기본은 라임(다크 배경 전제). */
  color?: string;
  /** 지름(px). 기본 8. */
  size?: number;
  /** false면 호흡을 끈다(정적 상태 표시용). */
  animated?: boolean;
  className?: string;
}

export function LiveDot({
  color = colors.lime.DEFAULT,
  size = 8,
  animated = true,
  className,
}: LiveDotProps) {
  return (
    <span
      data-testid="live-dot"
      data-animated={animated ? "true" : "false"}
      aria-hidden="true"
      className={[animated ? "oilpick-live-dot" : "", className].filter(Boolean).join(" ") || undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        color,
        flex: "0 0 auto",
        display: "inline-block",
      }}
    />
  );
}

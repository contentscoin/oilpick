import { type ReactNode } from "react";
import { elevation, gradient, radius, surfaceDark } from "../tokens";

/**
 * 15-motion-design.md — 화면의 주인공 숫자를 담는 다크 히어로 카드.
 * 사용자 홈(예상 수령액), 라이더 운행(목적지·거리)·실적(주간 성과)에서 공유한다.
 *
 * 글레어(카드 위를 지나는 빛)는 **장식 전용**이라 reduced-motion에서 완전히 숨긴다 —
 * 정보가 담기지 않았으므로 사라져도 손실이 없다(15 원칙 3).
 */
export interface HeroCardProps {
  /** 좌상단 라벨 pill(예: "Live Activity", "주간 목표 82%"). */
  eyebrow?: ReactNode;
  /** 주인공 문구. 숫자는 NumberFlow를 넣어도 된다. */
  title: ReactNode;
  /** 보조 설명. */
  description?: ReactNode;
  /** 하단 액션 영역. */
  footer?: ReactNode;
  /** 배경. 기본은 딥그린 브랜드 그라디언트. */
  background?: string;
  className?: string;
}

export function HeroCard({
  eyebrow,
  title,
  description,
  footer,
  background = gradient.brand,
  className,
}: HeroCardProps) {
  return (
    <div
      data-testid="hero-card"
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: radius.hero,
        background,
        color: surfaceDark.textOnDark,
        padding: 18,
        boxShadow: elevation.heroDark,
      }}
    >
      <span
        className="oilpick-glare"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 46,
          width: 160,
          height: 34,
          background: "rgba(255,255,255,0.22)",
          filter: "blur(18px)",
          pointerEvents: "none",
        }}
      />
      {eyebrow && (
        <span
          data-testid="hero-card-eyebrow"
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            borderRadius: radius.pill,
            backgroundColor: surfaceDark.pill,
            color: surfaceDark.textOnDark,
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {eyebrow}
        </span>
      )}
      <div
        data-testid="hero-card-title"
        style={{
          position: "relative",
          zIndex: 1,
          margin: eyebrow ? "14px 0 8px" : "0 0 8px",
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: "-0.01em",
          wordBreak: "keep-all",
        }}
      >
        {title}
      </div>
      {description && (
        <p
          style={{
            position: "relative",
            zIndex: 1,
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            color: surfaceDark.textOnDarkMuted,
            wordBreak: "keep-all",
          }}
        >
          {description}
        </p>
      )}
      {footer && <div style={{ position: "relative", zIndex: 1, marginTop: 16 }}>{footer}</div>}
    </div>
  );
}

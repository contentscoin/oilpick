import type { CSSProperties } from "react";
import { colors } from "../tokens";

/**
 * Payou 심볼 — 딥그린 라운드 사각 + 크림 기름통(P) + 골드 캡. 로고 심볼 재현(favicon.svg와 동일 도형).
 * 헤더 락업(심볼+워드마크)이나 단독 아이콘으로 사용. 색은 브랜드 토큰(primary/accent) 참조.
 */
export interface PayouSymbolProps {
  /** 한 변 크기(px). 기본 32. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const CREAM = "#F5EFE1";

export function PayouSymbol({ size = 32, className, style, title = "Payou" }: PayouSymbolProps) {
  const green = colors.primary.DEFAULT;
  const gold = colors.accent.DEFAULT;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
      style={style}
      data-testid="payou-symbol"
    >
      <rect width="64" height="64" rx="15" fill={green} />
      <rect x="17" y="20" width="30" height="30" rx="4.5" fill={CREAM} />
      <rect x="21" y="16.5" width="22" height="6" rx="2.5" fill={CREAM} />
      <path
        d="M24 16.5c0-2.2 1.6-3.8 3.8-3.8h2.6c2.2 0 3.8 1.6 3.8 3.8"
        fill="none"
        stroke={CREAM}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="37.5" y="13.5" width="7.5" height="5.5" rx="2" fill={gold} />
      <path
        d="M27 27.5h7.8c3.4 0 5.9 2.4 5.9 5.8s-2.5 5.8-5.9 5.8H31v5.4h-4V27.5Zm4 3.6v4.4h3.3c1.3 0 2.2-.9 2.2-2.2s-.9-2.2-2.2-2.2H31Z"
        fill={green}
      />
      <circle cx="36.4" cy="33.3" r="1.15" fill={gold} />
    </svg>
  );
}

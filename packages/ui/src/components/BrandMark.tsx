/**
 * 폐유(payou) 브랜드 로고 마크 — 제리캔 + P. docs/spec/10-brand.md B3·B6.
 * CEO 제공 로고(2026-07-23, 제리캔+P) 재현. 순수 SVG(외부 에셋 無, 크기 prop).
 * 로고 고유 팔레트를 상수로 둔다(디자인 토큰과 근사하지만 로고는 독립 규격).
 */
export interface BrandMarkProps {
  /** 렌더 크기(px, 정사각). */
  size?: number;
  /** 접근성 라벨. */
  title?: string;
}

const GREEN = "#1B5E3F";
const CREAM = "#F4EEDF";
const GOLD = "#C9A24B";

export function BrandMark({ size = 96, title = "폐유 로고" }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      data-testid="payou-brandmark"
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="15" fill={GREEN} />
      {/* 기름통 몸체 */}
      <rect x="15.5" y="18" width="33" height="38" rx="4.5" fill={CREAM} stroke={GREEN} strokeWidth="1.5" />
      {/* 손잡이(크림) */}
      <path
        d="M21 18.5 v-4 a2.6 2.6 0 0 1 2.6 -2.6 h5 a2.6 2.6 0 0 1 2.6 2.6 V18.5"
        fill="none"
        stroke={CREAM}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* 캡(골드) */}
      <rect x="36.5" y="13.5" width="8.5" height="5.5" rx="2" fill={GOLD} />
      {/* 정면 패널 */}
      <rect x="21" y="27" width="22" height="24" rx="3" fill="none" stroke={GREEN} strokeWidth="1.4" />
      {/* P (기하 경로 — 폰트 비의존) */}
      <g fill={GREEN}>
        <rect x="26" y="30" width="5" height="18.5" rx="1" />
        <path d="M31 30 h4.5 a6.5 6 0 0 1 0 12 H31 v-4 h4 a2 2 0 0 0 0 -4 h-4 z" />
      </g>
    </svg>
  );
}

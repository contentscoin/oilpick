import { colors, gray } from "../tokens";

/**
 * 오반장(OBJ) 마스코트 — docs/spec/10-brand.md B3.
 * 기름 방울 몸체(앰버 그라디언트) + 브랜드 그린 안전모 + "반장" 완장 + 미소.
 * 순수 SVG(외부 에셋·폰트 의존 없음), 색은 디자인 토큰만 사용(홍조는 accent.deep의 투명도 확장 —
 * chart 토큰과 같은 명도 축 확장 원칙). 정식 아트 발주 전까지의 1차 인앱 캐릭터.
 */
export interface MascotProps {
  /** 렌더 폭(px). 높이는 비율(120:140) 자동. */
  size?: number;
  /** 접근성 라벨(스크린리더). */
  title?: string;
}

export function Mascot({ size = 96, title = "오반장 캐릭터" }: MascotProps) {
  const height = Math.round(size * (140 / 120));
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 120 140"
      role="img"
      aria-label={title}
      data-testid="obj-mascot"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="objMascotBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.accent.DEFAULT} />
          <stop offset="100%" stopColor={colors.accent.deep} />
        </linearGradient>
      </defs>

      {/* 방울 몸체 — 꼭지가 안전모 위로 살짝 보인다(기름 방울 실루엣 유지) */}
      <path
        d="M60 12 C60 12 22 62 22 92 a38 38 0 0 0 76 0 C98 62 60 12 60 12 Z"
        fill="url(#objMascotBody)"
      />

      {/* 안전모(브랜드 그린): 돔 + 챙 */}
      <path d="M34 58 a26 20 0 0 1 52 0 Z" fill={colors.primary.DEFAULT} />
      <rect x="27" y="55" width="66" height="9" rx="4.5" fill={colors.primary.dark} />

      {/* 얼굴 */}
      <circle cx="46" cy="86" r="4.5" fill={gray[800]} />
      <circle cx="74" cy="86" r="4.5" fill={gray[800]} />
      <path
        d="M50 99 q10 9 20 0"
        stroke={gray[800]}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* 홍조 — accent.deep 25% (명도 축 확장) */}
      <circle cx="37" cy="96" r="5" fill={colors.accent.deep} opacity="0.25" />
      <circle cx="83" cy="96" r="5" fill={colors.accent.deep} opacity="0.25" />

      {/* "반장" 완장 */}
      <g transform="rotate(-14 98 106)">
        <rect x="84" y="99" width="28" height="15" rx="4" fill="#FFFFFF" stroke={colors.primary.dark} strokeWidth="2" />
        <text
          x="98"
          y="110.5"
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="700"
          fill={colors.primary.dark}
        >
          반장
        </text>
      </g>
    </svg>
  );
}

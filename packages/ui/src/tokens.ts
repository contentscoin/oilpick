// 디자인 토큰 — 단일 진실(single source of truth).
// docs/spec/03-frontend.md "디자인 토큰" 절 값을 그대로 옮긴 것.
// packages/config/tailwind-preset.js는 이 파일의 값을 참조해야 하며(중복 정의 금지),
// 이 파일의 값을 임의로 바꾸지 말 것 — 변경 시 스펙 문서를 먼저 갱신할 것.

/** 색상 토큰. 03-frontend.md "디자인 토큰" colors. */
export const colors = {
  primary: {
    DEFAULT: "#1B7A43",
    dark: "#145C32",
    light: "#E8F5EE",
  },
  accent: {
    DEFAULT: "#F5A623",
    light: "#FFF4E0",
  },
  up: "#E5484D",
  down: "#3B82F6",
  status: {
    wait: "#8B8B8B",
    active: "#3B82F6",
    done: "#1B7A43",
    danger: "#E5484D",
  },
} as const;

/**
 * 회색조. 03-frontend.md: "gray: Tailwind zinc 스케일 사용".
 * Tailwind 기본 zinc 팔레트 값을 그대로 상수화(런타임에서 Tailwind 없이도 참조 가능하도록).
 */
export const gray = {
  50: "#fafafa",
  100: "#f4f4f5",
  200: "#e4e4e7",
  300: "#d4d4d8",
  400: "#a1a1aa",
  500: "#71717a",
  600: "#52525b",
  700: "#3f3f46",
  800: "#27272a",
  900: "#18181b",
  950: "#09090b",
} as const;

/**
 * 폰트. 03-frontend.md: "Pretendard Variable (CDN woff2), 숫자 font-variant-numeric: tabular-nums".
 * CDN(jsDelivr)에서 Pretendard Variable 서브셋 woff2를 로드하는 @font-face 문자열.
 * 앱 엔트리(예: apps/user/src/main.tsx)에서 `import "@oilpick/ui/styles.css"` 또는
 * 이 문자열을 <style> 태그로 주입해 한 번만 등록하면 된다.
 */
export const fontFamily = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

/** CDN(jsDelivr)에서 서빙되는 Pretendard Variable woff2 경로. */
export const PRETENDARD_CDN_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2";

/** styles.css에도 동일 내용이 있다 — 여기서는 JS에서 동적으로 주입해야 할 때를 위한 문자열 export. */
export const fontFaceCss = `
@font-face {
  font-family: "Pretendard Variable";
  font-weight: 45 920;
  font-style: normal;
  font-display: swap;
  src: url("${PRETENDARD_CDN_URL}") format("woff2-variations");
}
`;

/**
 * 폰트 크기. 03-frontend.md: "base 16px 미만 금지. 시세/포인트 강조 32~40px bold".
 * 숫자는 px 단위(원 스펙 표기 그대로).
 */
export const fontSize = {
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  emphasisMin: 32,
  emphasisMax: 40,
} as const;

/** 숫자(시세/포인트/kg 등) 표시에 항상 적용해야 하는 CSS. 03-frontend.md font 절. */
export const numericFontVariant = {
  fontVariantNumeric: "tabular-nums",
} as const;

/** 간격. 03-frontend.md: "spacing: 4px 그리드. 터치 타깃 최소 48px". */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** 터치 타깃 최소 크기(px). 03-frontend.md spacing 절. */
export const touchTarget = 48;

/**
 * 모서리 반경. 03-frontend.md: "radius: 카드 16px, 버튼 12px".
 * 05-design-upgrade.md "토큰 확장": 히어로 카드 20px, pill 999px 추가.
 */
export const radius = {
  card: 16,
  hero: 20,
  button: 12,
  pill: 999,
} as const;

/**
 * 05-design-upgrade.md "토큰 확장" — surface 색.
 * 평평한 회색 배경 위에 흰 카드가 떠 보이도록 앱 배경/카드/경계 색을 분리한다.
 */
export const surface = {
  /** 앱 배경(약간 웜뉴트럴). */
  app: "#F5F6F5",
  /** 카드/시트 표면. */
  card: "#FFFFFF",
  /** 카드·구획 경계선(zinc-100). */
  border: gray[100],
} as const;

/**
 * 05-design-upgrade.md "토큰 확장" — elevation(그림자) 스케일.
 * 평평한 회색 배경 위 카드가 떠 보이게 한다. inline style/Tailwind 양쪽에서 쓰도록
 * CSS box-shadow 문자열로 정의.
 */
export const elevation = {
  /** 기본 카드(PriceCard/CallCard 등). */
  card: "0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)",
  /** 히어로/떠있는 카드(PointBalanceCard 등). */
  raised: "0 4px 16px rgba(16,24,40,0.08)",
  /** 눌림(선택). 버튼 active 등에서 참조. */
  pressed: "inset 0 1px 2px rgba(16,24,40,0.10)",
} as const;

/**
 * 05-design-upgrade.md "토큰 확장" — gradient 토큰.
 * 돈/포인트/시세 히어로 배경. 브랜드 색(딥그린/앰버) 계열만 사용(리브랜딩 아님).
 */
export const gradient = {
  /** 딥그린 계열 히어로 배경. */
  brand: `linear-gradient(135deg, ${colors.primary.DEFAULT}, ${colors.primary.dark})`,
  /** 앰버 계열 포인트 히어로 배경. */
  point: `linear-gradient(135deg, ${colors.accent.DEFAULT}, #E08A00)`,
} as const;

export const tokens = {
  colors,
  gray,
  fontFamily,
  fontSize,
  numericFontVariant,
  spacing,
  touchTarget,
  radius,
  surface,
  elevation,
  gradient,
} as const;

export type Tokens = typeof tokens;

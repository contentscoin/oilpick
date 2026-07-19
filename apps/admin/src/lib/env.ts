// 환경변수 접근 지점. 03-frontend.md "Capacitor 설정" 절(apps/admin도 동일 변수 사용).
// 지도 렌더러는 11-map-renderer.md M8로 MapLibre 전환 — admin은 카카오 키가 더 이상 불필요.
// MAP_STYLE_URL 미설정 시 undefined를 그대로 반환해 MapView 프리뷰 폴백이 작동한다.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const MAP_STYLE_URL: string | undefined = import.meta.env.VITE_MAP_STYLE_URL || undefined;

// 환경변수 접근 지점. 03-frontend.md "Capacitor 설정" 절:
// "환경변수: .env.development / .env.production (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_KAKAO_KEY, VITE_MAP_STYLE_URL)". 값이 없으면 undefined를 그대로 반환해
// MapView(프리뷰)/주소검색(수동 입력) 폴백 분기가 작동하게 한다.
// - KAKAO_KEY: 주소검색(AddressField)용 — 지도 렌더러는 11-map-renderer.md M8로 MapLibre 전환.
// - MAP_STYLE_URL: MapLibre 스타일 JSON URL 또는 {z}/{x}/{y} 래스터 타일 템플릿(VWorld 권장).

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const KAKAO_KEY: string | undefined = import.meta.env.VITE_KAKAO_KEY || undefined;
export const MAP_STYLE_URL: string | undefined = import.meta.env.VITE_MAP_STYLE_URL || undefined;

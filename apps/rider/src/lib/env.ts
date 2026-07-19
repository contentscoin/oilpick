// 환경변수 접근 지점. apps/user/src/lib/env.ts와 동일 패턴(03-frontend.md "Capacitor 설정").
// 지도 렌더러는 11-map-renderer.md M8로 MapLibre 전환 — rider는 카카오 키가 더 이상 불필요
// (길찾기는 카카오맵/TMap 앱 딥링크 핸드오프 — SDK 아님). MAP_STYLE_URL 미설정 시 undefined를
// 그대로 반환해 MapView 프리뷰 폴백이 작동한다.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const MAP_STYLE_URL: string | undefined = import.meta.env.VITE_MAP_STYLE_URL || undefined;
// 08 G6-①: 쿠폰 결제 화면 삭제로 TOSS_CLIENT_KEY/PG_PROVIDER 접근 지점을 제거했다
// (쿠폰 구매 모델 폐기, 08 P1 — 클라이언트 번들에 PG 관련 값 유입 0).

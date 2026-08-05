// 환경변수 접근 지점. apps/user/src/lib/env.ts와 동일 패턴(03-frontend.md "Capacitor 설정").
// 지도 렌더러는 11-map-renderer.md M8로 MapLibre 전환 — rider는 카카오 키가 더 이상 불필요
// (길찾기는 카카오맵/TMap 앱 딥링크 핸드오프 — SDK 아님). MAP_STYLE_URL 미설정 시 undefined를
// 그대로 반환해 MapView 프리뷰 폴백이 작동한다.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const MAP_STYLE_URL: string | undefined = import.meta.env.VITE_MAP_STYLE_URL || undefined;
// [17 Q3] 수거쿠폰 복권 — 08 G6-①이 제거했던 PG 접근 지점을 복원한다(07 F4/F14 원형).
// 토스페이먼츠 결제위젯 "클라이언트 키". 시크릿 키는 Edge Function(supabase secrets)에만 두고,
// 클라이언트 번들엔 이 클라이언트 키만 유입한다(절대 규칙 3의 확장). 미발급이면 undefined —
// 결제 화면이 "키 미발급" 안내로 폴백한다(토스 모드 한정 — 기본 PG는 코엠, 17 C3).
export const TOSS_CLIENT_KEY: string | undefined = import.meta.env.VITE_TOSS_CLIENT_KEY || undefined;
// 활성 PG(07 F14, 17 C3). "koem"이면 결제 화면이 코엠 결제창 form POST 플로우로 동작하고(토스
// 위젯 미사용, 클라이언트 키 불필요 — checkHash는 서버가 생성), "demo"면 결제창 없이 곧장
// 확정되는 데모 결제(코엠 실연결 전 시연·개발용 — 실 과금 없음)로 동작한다. 서버 PG_PROVIDER
// (supabase secrets)와 반드시 짝으로 설정한다 — 불일치 시 intent 응답과 화면 분기가 어긋난다.
export const PG_PROVIDER: "toss" | "koem" | "demo" =
  import.meta.env.VITE_PG_PROVIDER === "koem"
    ? "koem"
    : import.meta.env.VITE_PG_PROVIDER === "demo"
      ? "demo"
      : "toss";

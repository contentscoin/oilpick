// 환경변수 접근 지점. apps/user/src/lib/env.ts와 동일 패턴(03-frontend.md "Capacitor 설정":
// "환경변수: .env.development / .env.production (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_KAKAO_KEY)"). Kakao 키는 이 개발 환경에 없다(04-tasks.md 질문 목록) — 없으면 undefined를
// 그대로 반환해 MapView 폴백 분기가 작동하게 한다.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const KAKAO_KEY: string | undefined = import.meta.env.VITE_KAKAO_KEY || undefined;
// 토스페이먼츠 결제위젯 클라이언트 키(07 F4). 시크릿 키는 Edge Function(supabase secrets)에만 두고,
// 클라이언트 번들엔 이 클라이언트 키만 유입한다(절대 규칙 3의 확장, 07 §1-4). 가맹 심사 전에는
// 미발급이라 undefined — 결제 화면이 "키 미발급" 안내로 폴백한다(04-tasks.md 질문 목록 관례).
export const TOSS_CLIENT_KEY: string | undefined = import.meta.env.VITE_TOSS_CLIENT_KEY || undefined;
// 활성 PG(07 F14). "koem"이면 결제 화면이 코엠 결제창 form POST 플로우로 동작한다(토스 위젯
// 미사용, 클라이언트 키 불필요 — checkHash는 서버가 생성). 서버 PG_PROVIDER(supabase secrets)와
// 반드시 짝으로 설정한다 — 불일치 시 intent 응답(koem 필드)과 화면 분기가 어긋난다.
export const PG_PROVIDER: "toss" | "koem" =
  import.meta.env.VITE_PG_PROVIDER === "koem" ? "koem" : "toss";

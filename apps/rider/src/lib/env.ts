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

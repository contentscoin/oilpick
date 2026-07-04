// 환경변수 접근 지점. apps/user/src/lib/env.ts와 동일 패턴(03-frontend.md "Capacitor 설정":
// "환경변수: .env.development / .env.production (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_KAKAO_KEY)"). Kakao 키는 이 개발 환경에 없다(04-tasks.md 질문 목록) — 없으면 undefined를
// 그대로 반환해 MapView 폴백 분기가 작동하게 한다.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const KAKAO_KEY: string | undefined = import.meta.env.VITE_KAKAO_KEY || undefined;

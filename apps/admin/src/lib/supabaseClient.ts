// 앱 전역 단일 Supabase 클라이언트. packages/core의 팩토리(anon key 전용,
// CLAUDE.md 절대 규칙 3 — service_role은 클라이언트 번들에 절대 포함하지 않음)로 생성한다.
// admin도 anon key + 로그인 세션(RLS is_admin())으로만 데이터에 접근한다 — 쓰기는 반드시
// Edge Function(price-set/rider-verify/withdraw-process/point-adjust 등)을 통해서만 한다.

import { createOilpickSupabaseClient } from "@oilpick/core";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

export const supabase = createOilpickSupabaseClient({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
});

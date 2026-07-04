// Supabase 클라이언트 팩토리. 03-frontend.md "packages/core" 절:
// "supabase.ts: 클라이언트 팩토리 (env로 url/anon key 주입)".
// 각 앱은 자신의 env(import.meta.env 등)에서 값을 읽어 이 팩토리에 주입한다.
// service_role 키는 절대 이 팩토리로 만들지 않는다 — Edge Function 전용(CLAUDE.md 절대 규칙 3).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface CreateOilpickSupabaseClientOptions {
  url: string;
  anonKey: string;
}

/** anon key 기반 클라이언트 생성. 클라이언트(user/rider/admin 앱)에서만 사용. */
export function createOilpickSupabaseClient(
  options: CreateOilpickSupabaseClientOptions,
): SupabaseClient {
  const { url, anonKey } = options;
  if (!url) throw new Error("createOilpickSupabaseClient: url is required");
  if (!anonKey) throw new Error("createOilpickSupabaseClient: anonKey is required");
  return createClient(url, anonKey);
}

export type { SupabaseClient };

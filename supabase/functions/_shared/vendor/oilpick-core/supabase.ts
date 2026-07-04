// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/supabase.ts.
// packages/core/src/supabase.ts
import { createClient } from "@supabase/supabase-js";
function createOilpickSupabaseClient(options) {
  const { url, anonKey } = options;
  if (!url) throw new Error("createOilpickSupabaseClient: url is required");
  if (!anonKey) throw new Error("createOilpickSupabaseClient: anonKey is required");
  return createClient(url, anonKey);
}
export {
  createOilpickSupabaseClient
};

import { FunctionsHttpError } from "@supabase/supabase-js";
import { ERROR_MESSAGE_KO, type ErrorCode } from "@oilpick/core";
import { supabase } from "./supabaseClient";

/**
 * Edge Function 호출 결과. 02-api.md 공통 규칙 응답 envelope
 * `{ ok: true, data }` / `{ ok: false, code, message }`을 판별된 유니언으로 노출한다.
 * apps/user·apps/rider의 동일 헬퍼와 같은 구현(에러 파싱 근거는 그쪽 주석 참고).
 */
export type EdgeFunctionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export async function invokeEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeFunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = await error.context.json();
        const code = parsed?.code as ErrorCode | undefined;
        const message = (code && ERROR_MESSAGE_KO[code]) || parsed?.message;
        if (message) return { ok: false, message };
      } catch {
        // 바디 파싱 실패 시 아래 공통 폴백 메시지로 진행.
      }
    }
    return { ok: false, message: "요청 처리 중 오류가 발생했어요." };
  }

  if (!data?.ok) {
    const code = data?.code as ErrorCode | undefined;
    const message = (code && ERROR_MESSAGE_KO[code]) || data?.message || "요청 처리 중 오류가 발생했어요.";
    return { ok: false, message };
  }

  return { ok: true, data: data.data as T };
}

import { FunctionsHttpError } from "@supabase/supabase-js";
import { ERROR_MESSAGE_KO, type ErrorCode } from "@oilpick/core";
import { supabase } from "./supabaseClient";

/**
 * Edge Function 호출 결과. 02-api.md 공통 규칙 응답 envelope
 * `{ ok: true, data }` / `{ ok: false, code, message }`을 판별된 유니언으로 노출한다.
 */
// [14 J4] code를 노출한다 — 호출부가 코드별 맥락 카피로 덮어써야 하는 경우가 있다
// (예: INSUFFICIENT_BALANCE의 공용 문구는 출금 맥락이라 상계 결제 실패 화면에 맞지 않는다).
export type EdgeFunctionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code?: ErrorCode; message: string };

/**
 * supabase-js `functions.invoke`를 감싸 02-api.md 에러 envelope을 일관되게 파싱하는 헬퍼.
 *
 * supabase-js는 Edge Function이 비2xx를 반환하면 `data`를 채우지 않고 `error`(FunctionsHttpError)만
 * 던진다 — 이때 `{ ok:false, code, message }` 바디는 `error.context`(원본 Response 객체, 아직
 * 바디를 읽지 않은 상태)에서 직접 파싱해야 한다(실제 supabase-js 2.110.0 FunctionsClient 소스로
 * 확인: 비2xx 시 `throw new FunctionsHttpError(response)`, response.json()은 호출되지 않은 채
 * 그대로 던져짐). 이 파싱 없이 `invokeError.message`만 쓰면 "Edge Function returned a non-2xx
 * status code"라는 의미 없는 영어 문자열이 사용자에게 노출된다.
 */
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
        if (message) return { ok: false, code, message };
      } catch {
        // 바디 파싱 실패 시 아래 공통 폴백 메시지로 진행.
      }
    }
    return { ok: false, message: "요청 처리 중 오류가 발생했어요." };
  }

  if (!data?.ok) {
    const code = data?.code as ErrorCode | undefined;
    const message = (code && ERROR_MESSAGE_KO[code]) || data?.message || "요청 처리 중 오류가 발생했어요.";
    return { ok: false, code, message };
  }

  return { ok: true, data: data.data as T };
}

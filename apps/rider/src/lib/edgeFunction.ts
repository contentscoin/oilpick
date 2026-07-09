import { FunctionsHttpError } from "@supabase/supabase-js";
import { ERROR_MESSAGE_KO, type ErrorCode } from "@oilpick/core";
import { supabase } from "./supabaseClient";

/**
 * Edge Function 호출 결과. 02-api.md 공통 규칙 응답 envelope
 * `{ ok: true, data }` / `{ ok: false, code, message }`을 판별된 유니언으로 노출한다.
 * apps/user/src/lib/edgeFunction.ts와 동일 구현(중복 정의가 아니라 앱 경계를 넘는 코드 공유는
 * packages/core로만 한다는 CLAUDE.md 규칙 7의 취지상 이 얇은 호출 래퍼는 각 앱에 둔다 —
 * packages/core는 Deno Edge Function과도 공유되므로 supabase-js 클라이언트 인스턴스에
 * 의존하는 이 헬퍼를 넣지 않는다).
 */
export type EdgeFunctionResult<T> =
  | { ok: true; data: T }
  // code: 응답 envelope의 에러 코드(있으면). 07 F5 수락 게이트가 INSUFFICIENT_COUPON을
  // 분기하는 등, 호출부가 메시지 문자열 비교 없이 코드로 처리 분기할 수 있게 노출한다.
  | { ok: false; message: string; code?: ErrorCode };

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
        if (message) return { ok: false, message, code };
      } catch {
        // 바디 파싱 실패 시 아래 공통 폴백 메시지로 진행.
      }
    }
    return { ok: false, message: "요청 처리 중 오류가 발생했어요." };
  }

  if (!data?.ok) {
    const code = data?.code as ErrorCode | undefined;
    const message = (code && ERROR_MESSAGE_KO[code]) || data?.message || "요청 처리 중 오류가 발생했어요.";
    return { ok: false, message, code };
  }

  return { ok: true, data: data.data as T };
}

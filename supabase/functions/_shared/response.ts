// 공통 응답 헬퍼. docs/spec/02-api.md 공통 규칙:
// "응답: 성공 `{ ok: true, data }`, 실패 `{ ok: false, code, message }` + HTTP 상태코드."
// 에러 코드 문자열은 packages/core/src/errorCodes.ts를 그대로 재사용한다(공유 단일 진실).

import { ERROR_MESSAGE_KO } from "@oilpick/core/errorCodes.ts";
// [배포 호환] 함수 루트(supabase/functions) 밖 파일을 참조하면 Docker 없는
// `functions deploy --use-api` 업로드를 서버가 거부한다(DecodeError) — 타입 전용이라도 예외 없음.
// vendor 산출물은 esbuild가 타입을 지우므로, 동일 유니온을 값(키 집합)에서 파생한다.
type ErrorCode = keyof typeof ERROR_MESSAGE_KO;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...CORS_HEADERS,
};

/** 성공 응답: `{ ok: true, data }`. */
export function okResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * 실패 응답: `{ ok: false, code, message }`.
 * message를 명시하지 않으면 ERROR_MESSAGE_KO[code]를 기본값으로 사용한다.
 */
export function errorResponse(
  code: ErrorCode | string,
  status: number,
  message?: string,
): Response {
  const resolvedMessage =
    message ?? (ERROR_MESSAGE_KO as Record<string, string | undefined>)[code] ?? code;
  return new Response(
    JSON.stringify({ ok: false, code, message: resolvedMessage }),
    { status, headers: JSON_HEADERS },
  );
}

/** CORS preflight(OPTIONS) 응답. */
export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 함수 핸들러를 감싸 예기치 못한 예외를 500 응답으로 변환하는 공통 래퍼. */
export async function withErrorHandling(
  req: Request,
  handler: (req: Request) => Promise<Response>,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }
  try {
    return await handler(req);
  } catch (err) {
    console.error("unhandled error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      500,
      err instanceof Error ? err.message : "예기치 못한 오류가 발생했어요.",
    );
  }
}

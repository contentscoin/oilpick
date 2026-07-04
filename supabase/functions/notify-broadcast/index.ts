// notify-broadcast (admin). 03-frontend.md apps/admin "/notify":
// "전체/역할별 푸시 발송 폼". 02-api.md에는 이 엔드포인트가 명시돼 있지 않다 — T11 작업
// 지시사항이 요구하는 화면(공지)을 위한 신규 Edge Function이며, 새로운 설계 판단이 아니라
// 04-tasks.md 질문 목록에 이미 기록된 기존 가정("FCM_SERVICE_ACCOUNT 없음 → notifications
// insert는 항상 되고 실제 FCM 발송은 로그만")을 그대로 재사용하는 얇은 래퍼다
// (_shared/push.ts sendPush를 대상 role별 user id 목록에 호출).
//
// 클라이언트가 notifications 테이블에 직접 insert할 수 없다(01-db-schema.sql에 p_noti_insert
// 정책이 없음 — RLS 정책 없음 = 차단, CLAUDE.md 절대 규칙 3 "쓰기는 Edge Function만"과 동일
// 원칙). 이 함수(service_role)가 유일한 발송 경로다.

import { notifyBroadcastInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "admin");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = notifyBroadcastInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { target, title, body: message, link } = parsed.data;

    let query = admin.from("profiles").select("id");
    if (target !== "ALL") {
      query = query.eq("role", target);
    } else {
      query = query.in("role", ["supplier", "rider"]);
    }
    const { data: recipients, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const userIds = (recipients ?? []).map((r: { id: string }) => r.id);
    await sendPush(admin, userIds, title, message, link);

    return okResponse({ recipientCount: userIds.length });
  })
);

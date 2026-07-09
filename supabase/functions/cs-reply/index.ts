// cs-reply (admin). 07 F12 ②: CS 문의 답변 폼 처리.
// - 입력: { ticketId, reply, status: 'IN_PROGRESS'|'RESOLVED' }
// - 처리: cs_tickets.admin_reply + status(+ RESOLVED 시 resolved_at) 갱신 → 작성자에게 알림.
//
// 알림 경로 결정(07 F12 ②): 클라이언트(admin authenticated)는 notifications 테이블에 직접
// insert할 수 없다(01-db-schema.sql에 p_noti_insert 정책 없음 = RLS 차단. notify-broadcast/index.ts
// 주석과 동일 원칙). notify-broadcast는 role/ALL 대상이라 특정 작성자 1인을 겨냥할 수 없다.
// 따라서 rider-verify/withdraw-process와 같은 "admin 액션 = service_role Edge Function이 DB 변경 +
// sendPush" 기존 패턴을 재사용한다(신규 발송 로직 없음 — _shared/push.ts sendPush 그대로).
// 답변과 알림을 한 번의 요청에서 원자 처리한다.

import { csReplyInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = csReplyInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { ticketId, reply, status } = parsed.data;

    const { data: ticket, error: fetchErr } = await admin
      .from("cs_tickets")
      .select("id, author_id, category")
      .eq("id", ticketId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!ticket) {
      return errorResponse("NOT_FOUND", 404, "문의를 찾을 수 없어요.");
    }

    const { data: updated, error: updateErr } = await admin
      .from("cs_tickets")
      .update({
        admin_reply: reply,
        status,
        resolved_at: status === "RESOLVED" ? new Date().toISOString() : null,
      })
      .eq("id", ticketId)
      .select("id, status")
      .single();
    if (updateErr) throw updateErr;

    // 작성자에게 답변 알림(기존 알림 인프라 재사용). link는 앱 내 문의 화면(/support).
    await sendPush(
      admin,
      [ticket.author_id],
      status === "RESOLVED" ? "문의가 처리 완료됐어요" : "문의에 답변이 등록됐어요",
      reply.length > 60 ? `${reply.slice(0, 60)}…` : reply,
      "/support",
    );

    return okResponse({
      ticketId: updated.id,
      status: updated.status,
    });
  })
);

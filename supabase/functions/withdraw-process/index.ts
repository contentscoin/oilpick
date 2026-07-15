// withdraw-process (admin). docs/spec/02-api.md "8. withdraw-process (admin)":
// - 입력: { withdrawalId, decision: 'APPROVED'|'REJECTED'|'PAID', memo? }
// - REJECTED 시 WITHDRAW_CANCEL(+amount) 복구. 상태 전이: REQUESTED→APPROVED→PAID 또는
//   REQUESTED→REJECTED.
//
// 상태 전이+원장 복구는 단일 RPC(fn_process_withdraw, 20260704000008_rpc_withdraw_process.sql)
// 트랜잭션으로 처리 — Edge Function은 RPC 결과를 응답으로 변환만 한다.

import { withdrawProcessInputSchema } from "@oilpick/core/index.ts";
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
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = withdrawProcessInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { withdrawalId, decision, memo } = parsed.data;

    const { data: withdrawal, error: rpcErr } = await admin.rpc("fn_process_withdraw", {
      p_withdrawal_id: withdrawalId,
      p_decision: decision,
      p_admin_id: uid,
      p_memo: memo ?? null,
    });

    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
      if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
      console.error("withdraw-process: 예기치 못한 RPC 에러", rpcErr);
      throw rpcErr;
    }
    if (!withdrawal) {
      return errorResponse("NOT_FOUND", 404);
    }

    const title = decision === "REJECTED" ? "출금 반려" : decision === "PAID" ? "출금 완료" : "출금 승인";
    const body_ =
      decision === "REJECTED"
        ? "출금 신청이 반려되어 포인트가 복구되었어요."
        : decision === "PAID"
          ? "출금이 완료되었어요."
          : "출금 신청이 승인되었어요.";
    await sendPush(admin, [withdrawal.user_id], title, body_, "/wallet");

    return okResponse({
      withdrawalId: withdrawal.id,
      status: withdrawal.status,
    });
  })
);

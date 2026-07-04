// point-adjust (admin). docs/spec/02-api.md "10. point-adjust (admin)":
// - 입력: { userId, amount, memo } (memo 필수) → ADJUST insert.
//
// point_ledger는 append-only이며 클라이언트에서 절대 쓰지 않는다(CLAUDE.md 절대 규칙 1).
// 이 Edge Function은 fn_post_ledger RPC 호출로만 원장을 기록한다(재구현 금지). order_id가
// 없는 조정이므로 unique(order_id, entry_type, user_id) 제약에 걸리지 않는다(NULL은 서로 distinct
// — 여러 건의 ADJUST가 허용됨, fn_post_ledger 주석 참고).

import { pointAdjustInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

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
    const parsed = pointAdjustInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { userId, amount, memo } = parsed.data;

    const { data: targetProfile, error: profileErr } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!targetProfile) {
      return errorResponse("NOT_FOUND", 404, "대상 사용자를 찾을 수 없어요.");
    }

    const { data: ledgerRow, error: rpcErr } = await admin.rpc("fn_post_ledger", {
      p_user_id: userId,
      p_entry_type: "ADJUST",
      p_amount: amount,
      p_order_id: null,
      p_memo: memo,
      p_created_by: uid,
      p_withdrawal_id: null,
    });
    if (rpcErr) throw rpcErr;

    return okResponse({
      userId,
      amount: ledgerRow?.amount ?? amount,
    });
  })
);

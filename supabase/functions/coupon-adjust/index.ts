// coupon-adjust (admin). docs/spec/02-api.md "14. coupon-adjust (admin)" (07 F3b-⑤,
// [17 Q2] 쿠폰 복권으로 a4b4fdd^에서 재복원):
// - 입력: { riderId, qty(≠0), memo } (memo 필수) → fn_charge_coupon(ADJUST, ±qty, purchase_id=null).
//   CS 보조 / 데모 라이더 선지급(20장) 용도. point-adjust 패턴 복제.
//
// coupon_ledger는 append-only이며 클라이언트에서 절대 쓰지 않는다(07 §1-1, 절대 규칙 1 확장).
// 이 Edge Function은 fn_charge_coupon RPC 호출로만 원장을 기록한다(재구현 금지). purchase_id가
// null이므로 fn_charge_coupon은 ADJUST 분기로 라우팅되고, 음수 조정이 잔액을 초과하면
// RPC가 'INSUFFICIENT_COUPON'을 raise한다 → 409로 매핑.

import { couponAdjustInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = couponAdjustInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { riderId, qty, memo } = parsed.data;

    const { data: targetProfile, error: profileErr } = await admin
      .from("profiles")
      .select("id")
      .eq("id", riderId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!targetProfile) {
      return errorResponse("NOT_FOUND", 404, "대상 라이더를 찾을 수 없어요.");
    }

    const { data: ledgerRow, error: rpcErr } = await admin.rpc("fn_charge_coupon", {
      p_rider_id: riderId,
      p_qty: qty,
      p_unit_price: null,
      p_purchase_id: null,
      p_memo: memo,
      p_created_by: uid,
    });
    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("INSUFFICIENT_COUPON")) return errorResponse("INSUFFICIENT_COUPON", 409);
      if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
      throw rpcErr;
    }

    return okResponse({
      riderId,
      qty: ledgerRow?.qty ?? qty,
    });
  })
);

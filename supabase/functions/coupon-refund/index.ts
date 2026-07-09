// coupon-refund (admin). docs/spec/02-api.md "13. coupon-refund" (07 F4):
// 쿠폰 구매 건 환불(구매 건 단위, 건당 1회, 07 §1-4).
//
// 순서(확정): 미사용 잔액 fail-fast(order-accept 패턴) → PG 취소 API(cancelAmount=qty×unit_price) →
// 성공 시 fn_refund_purchase(ADJUST(-qty, purchase_id) + status=REFUNDED) 원자 확정 → rider "환급" 알림.
// PG 취소 실패 시 원장 무변경(PAYMENT_FAILED). 취소 성공 후 RPC 실패는 대사 대상(로그 + 에러 반환).
// PG 호출은 _shared/pg.ts 어댑터 경유(F14-①, 기본 토스). 시크릿 키는 Edge Function 전용.

import { couponRefundInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import { getPgAdapter } from "../_shared/pg.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

async function readBalance(admin: SupabaseClient, riderId: string): Promise<number> {
  const { data, error } = await admin
    .from("v_coupon_balance")
    .select("balance")
    .eq("rider_id", riderId)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

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
    const parsed = couponRefundInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { purchaseId, qty, reason } = parsed.data;

    // 구매 건 로드. 환불은 PAID만(fn_refund_purchase가 최종 진실, 여기선 fail-fast).
    const { data: purchase, error: loadErr } = await admin
      .from("coupon_purchases")
      .select("id, rider_id, qty, unit_price, payment_key, status")
      .eq("id", purchaseId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!purchase) return errorResponse("NOT_FOUND", 404);
    if (purchase.status !== "PAID") {
      return errorResponse("INVALID_TRANSITION", 409, "환불할 수 있는 결제 건이 아니에요.");
    }
    if (!purchase.payment_key) {
      return errorResponse("VALIDATION_ERROR", 400, "결제 정보가 없어 환불할 수 없어요.");
    }

    // qty 생략=전액. 상한(구매 qty) 검증(RPC도 재검증).
    const refundQty = qty ?? (purchase.qty as number);
    if (refundQty > (purchase.qty as number)) {
      return errorResponse("VALIDATION_ERROR", 400, "환불 수량이 구매 수량을 초과했어요.");
    }

    // fail-fast: 미사용 잔액 < 환불 qty면 PG 취소 전에 거부(취소 후 RPC 실패 최소화, 07 §1-4).
    const balanceBefore = await readBalance(admin, purchase.rider_id);
    if (balanceBefore < refundQty) {
      return errorResponse("INSUFFICIENT_COUPON", 409);
    }

    const cancelAmount = refundQty * (purchase.unit_price as number);

    // PG 취소(환불). 실패 시 원장 무변경(PAYMENT_FAILED).
    const pg = getPgAdapter();
    try {
      await pg.cancelPayment(purchase.payment_key as string, {
        cancelReason: reason,
        cancelAmount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      console.error("PG 취소 실패(원장 무변경)", err);
      return errorResponse("PAYMENT_FAILED", 402, message);
    }

    // 취소 성공 → 원장 확정(원자). 상태 기반 멱등·잔액 재계산은 RPC가 담당.
    const { error: rpcErr } = await admin.rpc("fn_refund_purchase", {
      p_purchase_id: purchaseId,
      p_qty: refundQty,
      p_admin_id: uid,
      p_memo: reason,
    });
    if (rpcErr) {
      // PG는 이미 취소됨 → 원장 미반영. 자동 복구 불가하므로 대사 대상으로 로그.
      console.error(
        "coupon-refund: PG 취소 성공 후 fn_refund_purchase 실패 — 수동 대사 필요",
        { purchaseId, refundQty, rpcErr },
      );
      const message = rpcErr.message ?? "";
      if (message.includes("INSUFFICIENT_COUPON")) return errorResponse("INSUFFICIENT_COUPON", 409);
      if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
      if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
      throw rpcErr;
    }

    // rider "쿠폰 환급" 알림(07 §1-6).
    await sendPush(
      admin,
      [purchase.rider_id],
      "쿠폰 환급",
      `쿠폰 ${refundQty}장이 환급되었어요.`,
      "/coupons/purchase",
    );

    return okResponse({
      purchaseId,
      refundedQty: refundQty,
      balance: await readBalance(admin, purchase.rider_id),
    });
  })
);

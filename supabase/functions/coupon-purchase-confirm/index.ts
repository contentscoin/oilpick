// coupon-purchase-confirm (rider). docs/spec/02-api.md "12. coupon-purchase-confirm" (07 F4,
// [17 Q2] 쿠폰 복권으로 a4b4fdd^에서 재복원): PG 승인 확정 + 쿠폰 충전(멱등 3중, 07 §1-4).
//
// 절차(단일 RPC 트랜잭션 원칙 — 원장+상태 전이는 fn_confirm_purchase가 원자 처리):
//   ① 본인 소유·pg_order_id 일치 확인 → ② 이미 PAID면 멱등 성공(잔액만 반환) →
//   ③ PENDING 재확인 + amount 위변조 거부 → ④ PG 승인 API 호출(RPC 밖) + 응답 amount 재검증 →
//   ⑤ fn_confirm_purchase(PENDING→PAID + CHARGE) → ⑥ 잔액 재조회 + "쿠폰 N장 충전 완료" 알림.
// 실패 시: 승인 실패 → FAILED 전이. 승인 후 확정 실패 → PG 취소 시도 + FAILED. amount 불일치 → 거부.
// PG 호출은 _shared/pg.ts 어댑터 경유(F14-①, 활성 PG는 PG_PROVIDER — 기본 koem, 17 C3). PG 시크릿
// 키는 Edge Function 전용(절대 규칙 3의 확장) — 어댑터가 Deno.env에서만 읽는다.
// 코엠 모드에서는 어댑터 confirmPayment가 NOT_SUPPORTED로 거절되어 402 — 확정은 return 콜백(12-1).

import { couponPurchaseConfirmInputSchema, NOTIFY_KIND } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import { getPgAdapter, type PgAdapter } from "../_shared/pg.ts";
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

/** PENDING인 구매 건만 FAILED로 전이(승자/이미 확정된 건은 건드리지 않음). */
async function markFailed(admin: SupabaseClient, purchaseId: string): Promise<void> {
  const { error } = await admin
    .from("coupon_purchases")
    .update({ status: "FAILED" })
    .eq("id", purchaseId)
    .eq("status", "PENDING");
  if (error) console.error("coupon_purchases FAILED 전이 실패", error);
}

/** 승인 후 확정 실패 시 PG 취소 best-effort(막지 않음 — 실패해도 로그만). */
async function tryCancel(pg: PgAdapter, paymentKey: string, reason: string): Promise<void> {
  try {
    await pg.cancelPayment(paymentKey, { cancelReason: reason });
  } catch (err) {
    console.error("PG 취소 시도 실패(수동 대사 필요)", err);
  }
}

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "rider");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = couponPurchaseConfirmInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { purchaseId, paymentKey, pgOrderId, amount } = parsed.data;

    // ① 구매 건 로드 + 소유/일치 확인.
    const { data: purchase, error: loadErr } = await admin
      .from("coupon_purchases")
      .select("id, rider_id, qty, amount, pg_order_id, status")
      .eq("id", purchaseId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!purchase) return errorResponse("NOT_FOUND", 404);
    if (purchase.rider_id !== uid) return errorResponse("FORBIDDEN", 403);
    if (purchase.pg_order_id !== pgOrderId) {
      return errorResponse("VALIDATION_ERROR", 400, "주문번호가 일치하지 않아요.");
    }

    // ② 이미 PAID면 멱등 성공(orphan/재시도 — 이중 충전·이중 알림 없음).
    if (purchase.status === "PAID") {
      return okResponse({ balance: await readBalance(admin, purchase.rider_id) });
    }
    // 확정 불가 상태(FAILED/EXPIRED/REFUNDED).
    if (purchase.status !== "PENDING") {
      return errorResponse("INVALID_TRANSITION", 409);
    }

    // ③ amount 위변조 거부 — 서버 스냅샷(purchase.amount)이 진실. 전이 없음.
    if (amount !== purchase.amount) {
      return errorResponse("VALIDATION_ERROR", 400, "결제 금액이 일치하지 않아요.");
    }

    // ④ PG 승인 API(RPC 밖). paymentKey/orderId/amount는 서버 스냅샷 기준으로 호출.
    const pg = getPgAdapter();
    try {
      const payment = await pg.confirmPayment({
        paymentKey,
        orderId: purchase.pg_order_id,
        amount: purchase.amount,
      });
      // 승인 금액 재검증. 불일치 시 취소 시도 + FAILED.
      if (payment.totalAmount !== purchase.amount) {
        await tryCancel(pg, paymentKey, "승인 금액 불일치");
        await markFailed(admin, purchaseId);
        return errorResponse("VALIDATION_ERROR", 400, "결제 금액이 일치하지 않아요.");
      }
    } catch (err) {
      // 이미 승인된 결제(재시도/동시 confirm 승자)는 취소하지 않고 멱등 확정으로 진행.
      if (!pg.isAlreadyProcessed(err)) {
        // 승인 실패(거절/네트워크 등) → FAILED 전이.
        await markFailed(admin, purchaseId);
        const message = err instanceof Error ? err.message : undefined;
        return errorResponse("PAYMENT_FAILED", 402, message);
      }
    }

    // ⑤ 확정 RPC(원자): PENDING→PAID + payment_key + CHARGE. 재호출/동시성 멱등.
    const { data: ledger, error: rpcErr } = await admin.rpc("fn_confirm_purchase", {
      p_purchase_id: purchaseId,
      p_payment_key: paymentKey,
    });
    if (rpcErr) {
      // 승인은 됐으나 충전 확정 실패(예: TTL EXPIRED로 상태 이탈) → 취소 시도 + FAILED.
      await tryCancel(pg, paymentKey, "충전 처리 실패");
      await markFailed(admin, purchaseId);
      const message = rpcErr.message ?? "";
      if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
      console.error("coupon-purchase-confirm: 예기치 못한 RPC 에러", rpcErr);
      return errorResponse("PAYMENT_FAILED", 402);
    }
    void ledger;

    // ⑥ 잔액 재조회 + 충전 알림("쿠폰 N장 충전 완료", 07 §1-6).
    // kind=COUPON_CHARGED — [17 Q2] 알림 계층 단일화(16 L2) 이후 복원이라 notifications.kind에 등재.
    const balance = await readBalance(admin, purchase.rider_id);
    await sendPush(
      admin,
      [purchase.rider_id],
      "쿠폰 충전 완료",
      `쿠폰 ${purchase.qty}장 충전 완료`,
      "/coupons/purchase",
      undefined,
      NOTIFY_KIND.COUPON_CHARGED,
    );

    return okResponse({ balance });
  })
);

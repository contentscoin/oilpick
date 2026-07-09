// coupon-purchase-intent (rider). docs/spec/02-api.md "11. coupon-purchase-intent" (07 F4):
// - 입력: { qty }(1~200) → 최신 coupon_price_ticks 단가 스냅샷 → coupon_purchases(PENDING) insert.
// - 출력: { purchaseId, pgOrderId, amount, unitPrice }. 단가 미설정 시 409 COUPON_PRICE_NOT_SET.
//
// PG 결제위젯 진입 전 단계. 여기서 amount·unit_price를 서버가 확정·스냅샷해 두고, confirm이
// 토스 응답 amount와 대조한다(클라이언트가 보낸 금액을 신뢰하지 않는다 — 07 §1-4). coupon_purchases
// 쓰기는 Edge Function(service_role)만(절대 규칙 3, 20260709000002 RLS: insert 정책 부재=차단).

import { couponPurchaseIntentInputSchema } from "@oilpick/core/index.ts";
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
      requireRole(ctx, "rider");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = couponPurchaseIntentInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { qty } = parsed.data;

    // 최신 쿠폰 단가 tick(종가) — 없으면 409 COUPON_PRICE_NOT_SET(07 §1-4).
    const { data: tick, error: tickErr } = await admin
      .from("coupon_price_ticks")
      .select("unit_price")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tickErr) throw tickErr;
    if (!tick) {
      return errorResponse("COUPON_PRICE_NOT_SET", 409);
    }

    const unitPrice = tick.unit_price as number;
    const amount = qty * unitPrice;
    // pg_order_id: 충돌 없는 규칙(07 F4). unique 제약(coupon_purchases.pg_order_id)과 짝.
    const pgOrderId = `oc_${crypto.randomUUID()}`;

    const { data: purchase, error: insertErr } = await admin
      .from("coupon_purchases")
      .insert({
        rider_id: uid,
        qty,
        unit_price: unitPrice,
        amount,
        pg_order_id: pgOrderId,
        status: "PENDING",
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    return okResponse({
      purchaseId: purchase.id,
      pgOrderId,
      amount,
      unitPrice,
    });
  })
);

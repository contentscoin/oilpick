// coupon-purchase-intent (rider). docs/spec/02-api.md "11. coupon-purchase-intent" (07 F4·F14,
// [17 Q2] 쿠폰 복권으로 a4b4fdd^에서 재복원):
// - 입력: { qty }(1~200) → 최신 coupon_price_ticks 단가 스냅샷 → coupon_purchases(PENDING) insert.
// - 출력: { purchaseId, pgOrderId, amount, unitPrice, koem?, demo? }. 단가 미설정 시 409 COUPON_PRICE_NOT_SET.
//
// PG 결제 진입 전 단계. 여기서 amount·unit_price를 서버가 확정·스냅샷해 두고, 확정 경로(토스
// confirm / 코엠 return 콜백)가 PG 응답 amount와 대조한다(클라이언트가 보낸 금액을 신뢰하지
// 않는다 — 07 §1-4). PG_PROVIDER=koem이면 결제창 form 파라미터(checkHash 포함)를 서버가 만들어
// koem 필드로 반환한다(F14 — API_KEY가 필요해 클라이언트 생성 불가). coupon_purchases
// 쓰기는 Edge Function(service_role)만(절대 규칙 3, 20260709000002 RLS: insert 정책 부재=차단).

import { couponPurchaseIntentInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { getPgAdapter } from "../_shared/pg.ts";
import { buildKoemPayParams, type KoemPayParams } from "../_shared/koem.ts";

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
    // pg_order_id: 충돌 없는 규칙(07 F4→F14 개정: 코엠 응답 orderno가 Max 20이라 20자 고정 —
    // 토스 orderId 규칙[6~64자 영숫자]과도 호환). unique 제약(pg_order_id)이 최종 방어.
    const pgOrderId = `op${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;

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

    // 코엠 모드(F14): 결제창 진입 form 파라미터를 서버에서 생성해 동봉. rUrl은 결제 확정을
    // 담당하는 coupon-purchase-return(verify_jwt=false) — 기본값은 이 프로젝트의 함수 URL.
    const provider = getPgAdapter().provider;
    let koem: KoemPayParams | undefined;
    if (provider === "koem") {
      const returnUrl = Deno.env.get("KOEM_RETURN_URL") ??
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/coupon-purchase-return`;
      koem = await buildKoemPayParams(
        { pgOrderId, amount, qty, purchaseId: purchase.id as string },
        { returnUrl, returnAppUrl: Deno.env.get("KOEM_RETURN_APP_URL") ?? undefined },
      );
    }

    return okResponse({
      purchaseId: purchase.id,
      pgOrderId,
      amount,
      unitPrice,
      ...(koem ? { koem } : {}),
      // 데모 모드(F14 데모 운영): 클라이언트가 결제창 없이 곧장 confirm을 호출하라는 신호.
      ...(provider === "demo" ? { demo: true as const } : {}),
    });
  })
);

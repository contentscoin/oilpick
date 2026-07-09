// coupon-price-set (admin). docs/spec/02-api.md "15. coupon-price-set (admin)" (07 F3b-⑤):
// - 입력: { unitPrice } (>0) → coupon_price_ticks insert. price-set 패턴 복제.
//
// coupon_price_ticks는 price_ticks 미러(07 §1-4): 전체 read, admin insert, update/delete 정책 없음
// (정정 불가·신규 tick만). price-set과 동일하게 service_role(admin) 클라이언트로 insert한다
// (RLS is_admin() insert 정책이 있으나 Edge Function은 service_role로 접근 — price-set 관례 그대로).
// 상태머신/원장 테이블이 아니라 단순 시계열 insert이므로 RPC 트랜잭션 불필요.

import { couponPriceSetInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = couponPriceSetInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { unitPrice } = parsed.data;

    const { data: tick, error: insertErr } = await admin
      .from("coupon_price_ticks")
      .insert({
        unit_price: unitPrice,
        created_by: uid,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    return okResponse({
      id: tick.id,
      unitPrice: tick.unit_price,
      effectiveAt: tick.effective_at,
    });
  })
);

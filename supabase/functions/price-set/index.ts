// price-set (admin). docs/spec/02-api.md "9. price-set (admin)":
// - 입력: { pricePerKg, riderFee } → price_ticks insert.
// 00-domain.md "시세 규칙": "admin이 (원/kg 매입가, 수거비 기본값 P) 설정 → price_ticks insert
// (effective_at now). 현재 시세 = effective_at 최신 1건."
//
// price_ticks는 상태머신/원장 테이블이 아니라 단순 시계열 insert이므로 RPC 트랜잭션 없이
// service_role insert로 충분하다(02-api.md "핵심 RPC: fn_transition_order, fn_post_ledger"에
// price_ticks는 포함되지 않음). 입력 검증(양수)은 zod 스키마(z.number().int().positive())로 수행.

import { priceSetInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = priceSetInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { pricePerKg, riderFee } = parsed.data;

    const { data: tick, error: insertErr } = await admin
      .from("price_ticks")
      .insert({
        price_per_kg: pricePerKg,
        rider_fee: riderFee,
        created_by: uid,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    return okResponse({
      id: tick.id,
      pricePerKg: tick.price_per_kg,
      riderFee: tick.rider_fee,
      effectiveAt: tick.effective_at,
    });
  })
);

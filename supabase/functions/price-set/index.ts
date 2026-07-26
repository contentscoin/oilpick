// price-set (admin). docs/spec/02-api.md "9. price-set (admin)":
// - 입력: { pricePerKg } → price_ticks insert. riderFee 계약 삭제(레거시 — rider_fee 미기록, 07 §1-3, F3b-④).
// 00-domain.md "시세 규칙": "admin이 (원/kg 매입가) 설정 → price_ticks insert
// (effective_at now). 현재 시세 = effective_at 최신 1건." 수거비 입력은 삭제(레거시).
//
// price_ticks는 상태머신/원장 테이블이 아니라 단순 시계열 insert이므로 RPC 트랜잭션 없이
// service_role insert로 충분하다(02-api.md "핵심 RPC: fn_transition_order, fn_post_ledger"에
// price_ticks는 포함되지 않음). 입력 검증(양수)은 zod 스키마(z.number().int().positive())로 수행.

import { priceSetInputSchema, freshOilPriceSetInputSchema } from "@oilpick/core/index.ts";
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

    // [14 J2] kind='FRESH'면 신유 고시가(fresh_oil_price_ticks), 그 외(기본 폐유 시세)는 price_ticks.
    if (body && (body as { kind?: string }).kind === "FRESH") {
      const parsedFresh = freshOilPriceSetInputSchema.safeParse(body);
      if (!parsedFresh.success) {
        return errorResponse("VALIDATION_ERROR", 400, parsedFresh.error.issues[0]?.message);
      }
      const { data: freshTick, error: freshErr } = await admin
        .from("fresh_oil_price_ticks")
        .insert({ price_per_can: parsedFresh.data.pricePerCan, created_by: uid })
        .select("*")
        .single();
      if (freshErr) throw freshErr;
      return okResponse({
        id: freshTick.id,
        pricePerCan: freshTick.price_per_can,
        effectiveAt: freshTick.effective_at,
      });
    }

    const parsed = priceSetInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { pricePerKg } = parsed.data;

    const { data: tick, error: insertErr } = await admin
      .from("price_ticks")
      .insert({
        price_per_kg: pricePerKg,
        created_by: uid,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    return okResponse({
      id: tick.id,
      pricePerKg: tick.price_per_kg,
      effectiveAt: tick.effective_at,
    });
  })
);

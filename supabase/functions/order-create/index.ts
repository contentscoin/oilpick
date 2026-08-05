// order-create (supplier). docs/spec/02-api.md "1. order-create (supplier)":
// - 입력: { requestedCans?, requestedKg, address, lat, lng, preferredTime }
// - 검증: requestedKg 1~500. 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 TOO_MANY_ACTIVE.
// - 처리: 최신 price_tick 스냅샷 + [17 Q2 복권] coupon_cost = ceil(requestedKg / KG_PER_CAN)
//   스냅샷 재개(17 C1 — 08 P1이 중지했던 것을 역전. 이 스냅샷이 fn_transition_order의 잠들어
//   있던 ACCEPT CONSUME 게이트를 RPC 무변경으로 부활시킨다. 구매 단독 주문 requestedKg 0은
//   coupon_cost 0 → null 저장 = 게이트 불요) → pickup_orders insert(REQUESTED) → order_events →
//   반경 3km 매칭 브로드캐스트(broadcastCall 헬퍼).
//   rider_fee 스냅샷 중지 유지(레거시 — snapshot_rider_fee 미기록, 07 §1-3).
// - 출력: { orderId, snapshotPricePerKg, estimatedCash } (08 G3-① — couponCost 삭제)
//
// 상태머신/원장 로직은 재구현하지 않는다 — 이 함수는 생성 자체(REQUESTED 최초 insert)만 담당하며
// 이후 전이는 fn_transition_order(order-accept/order-transition)가 전담한다.

import { orderCreateInputSchema, estimateCash, KG_PER_CAN } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";

const ACTIVE_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"];
const INITIAL_BROADCAST_RADIUS_KM = 3;

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "supplier");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = orderCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    // 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 TOO_MANY_ACTIVE (02-api.md order-create).
    const { count: activeCount, error: activeErr } = await admin
      .from("pickup_orders")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", uid)
      .in("status", ACTIVE_STATUSES);
    if (activeErr) throw activeErr;
    if ((activeCount ?? 0) >= 3) {
      return errorResponse("TOO_MANY_ACTIVE", 409);
    }

    // 최신 price_tick 스냅샷. rider_fee는 레거시라 조회하지 않는다(07 §1-3).
    const { data: priceTick, error: priceErr } = await admin
      .from("price_ticks")
      .select("price_per_kg")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priceErr) throw priceErr;
    if (!priceTick) {
      return errorResponse("NOT_FOUND", 404, "현재 시세 정보를 찾을 수 없어요.");
    }

    // [14 J2] 신유 구매 동반 시 최신 신유 고시가를 스냅샷한다. 폐유 성분(requestedKg≥1) 유무로
    // order_kind를 판정: 구매만=PURCHASE / 수거+구매=MIXED / 수거만=PICKUP. 신유 tick이 없으면
    // 구매 신청을 받을 수 없으므로 404(클라이언트는 tick 부재 시 구매 UI를 숨긴다).
    let orderKind: "PICKUP" | "PURCHASE" | "MIXED" = "PICKUP";
    let purchaseRequestedCans: number | null = null;
    let snapshotFreshCanPrice: number | null = null;
    if (input.purchaseCans != null) {
      const { data: freshTick, error: freshErr } = await admin
        .from("fresh_oil_price_ticks")
        .select("price_per_can")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (freshErr) throw freshErr;
      if (!freshTick) {
        return errorResponse("NOT_FOUND", 404, "현재 새 기름 판매가 정보를 찾을 수 없어요.");
      }
      purchaseRequestedCans = input.purchaseCans;
      snapshotFreshCanPrice = freshTick.price_per_can;
      orderKind = input.requestedKg >= 1 ? "MIXED" : "PURCHASE";
    }

    // [17 Q2] coupon_cost 스냅샷 재개(17 C1, 07 §1-2 공식 그대로) — kg 기준 ceil, 이후 계량
    // 결과와 무관(쿠폰은 매칭 수수료). 0(구매 단독, requestedKg 0)이면 null 저장 —
    // fn_transition_order의 CONSUME/REFUND 게이트는 `coupon_cost is not null`일 때만 실행된다.
    const couponCost = Math.ceil(input.requestedKg / KG_PER_CAN) || null;

    const { data: order, error: insertErr } = await admin
      .from("pickup_orders")
      .insert({
        supplier_id: uid,
        status: "REQUESTED",
        requested_cans: input.requestedCans ?? null,
        requested_kg: input.requestedKg,
        pickup_address: input.address,
        pickup_location: `SRID=4326;POINT(${input.lng} ${input.lat})`,
        preferred_time: input.preferredTime,
        snapshot_price_per_kg: priceTick.price_per_kg,
        coupon_cost: couponCost,
        broadcast_radius_km: INITIAL_BROADCAST_RADIUS_KM,
        order_kind: orderKind,
        purchase_requested_cans: purchaseRequestedCans,
        snapshot_fresh_can_price: snapshotFreshCanPrice,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    const { error: eventErr } = await admin.from("order_events").insert({
      order_id: order.id,
      from_status: null,
      to_status: "REQUESTED",
      actor_id: uid,
      payload: input,
    });
    if (eventErr) throw eventErr;

    await broadcastCall(admin, order.id, input.lat, input.lng, INITIAL_BROADCAST_RADIUS_KM);

    const estimatedCash = estimateCash(input.requestedKg, priceTick.price_per_kg);

    return okResponse({
      orderId: order.id,
      snapshotPricePerKg: priceTick.price_per_kg,
      estimatedCash,
    });
  })
);

/**
 * broadcastCall(orderId, radiusKm): 02-api.md "1. order-create" 절.
 * rider_profiles에서 verify_status='APPROVED' and is_online and last_location 반경 내
 * and 진행중 주문 없음 검색 → FCM 멀티캐스트 + notifications insert.
 */
async function broadcastCall(
  admin: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<number> {
  // PostGIS ST_DWithin(geography)로 반경 검색 + 진행중 주문 보유 라이더 제외.
  const { data: riders, error } = await admin.rpc("fn_find_eligible_riders", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });

  if (error) {
    console.error("broadcastCall: 라이더 검색 실패", error);
    return 0;
  }
  const riderIds = (riders ?? []).map((r: { rider_id: string }) => r.rider_id);
  if (riderIds.length === 0) return 0;

  // type="NEW_CALL": rider 앱 foreground 콜 배너(06 E3)의 분류 신호 — 완료/취소 푸시와 구분.
  await sendPush(admin, riderIds, "신규 콜 도착", "근처에 새 수거 요청이 있어요.", `/orders/${orderId}`, "NEW_CALL");
  return riderIds.length;
}

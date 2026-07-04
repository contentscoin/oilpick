// order-expire (cron, 1분마다). docs/spec/02-api.md "4. order-expire":
// REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km,
// 30분→자동 CANCELLED(사유 NO_RIDER).
// broadcast_radius_km 컬럼으로 현재 단계 추적(중복 브로드캐스트 방지).
//
// 실제 스케줄링 배선(pg_cron 등)은 배포 시점 설정이라 이 태스크 범위 밖 — 로컬에서는 curl로
// 직접 호출해 로직만 검증한다(태스크 지시사항). 취소는 fn_transition_order의 CANCEL 액션에 위임.

import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const STAGE_7KM_AFTER_MIN = 5;
const STAGE_15KM_AFTER_MIN = 10;
const CANCEL_AFTER_MIN = 30;

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    // cron(서버 간) 호출 전제 — 로컬 검증은 admin 계정 JWT 또는 service_role 키로 호출한다.
    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "admin");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { admin } = ctx;

    const now = new Date();

    const { data: requested, error: fetchErr } = await admin
      .from("pickup_orders")
      .select(
        "id, supplier_id, created_at, broadcast_radius_km, pickup_location, requested_kg",
      )
      .eq("status", "REQUESTED");
    if (fetchErr) throw fetchErr;

    let rebroadcasted = 0;
    let cancelled = 0;

    for (const order of requested ?? []) {
      const elapsedMin = (now.getTime() - new Date(order.created_at).getTime()) / 60000;

      if (elapsedMin >= CANCEL_AFTER_MIN) {
        await cancelNoRider(admin, order.id, order.supplier_id);
        cancelled++;
        continue;
      }

      if (elapsedMin >= STAGE_15KM_AFTER_MIN && order.broadcast_radius_km < 15) {
        await rebroadcast(admin, order.id, 15);
        rebroadcasted++;
        continue;
      }

      if (elapsedMin >= STAGE_7KM_AFTER_MIN && order.broadcast_radius_km < 7) {
        await rebroadcast(admin, order.id, 7);
        rebroadcasted++;
        continue;
      }
    }

    return okResponse({ rebroadcasted, cancelled });
  })
);

async function rebroadcast(
  admin: SupabaseClient,
  orderId: string,
  radiusKm: number,
): Promise<void> {
  const { data: order, error } = await admin
    .from("pickup_orders")
    .select("pickup_location")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) {
    console.error("rebroadcast: 주문 조회 실패", error);
    return;
  }

  // pickup_location(geography)에서 lat/lng 추출 — ST_Y/ST_X.
  const { data: point, error: pointErr } = await admin.rpc("fn_point_lat_lng", {
    p_geog: order.pickup_location,
  });
  if (pointErr || !point) {
    console.error("rebroadcast: 좌표 변환 실패", pointErr);
    return;
  }

  const { error: updateErr } = await admin
    .from("pickup_orders")
    .update({ broadcast_radius_km: radiusKm })
    .eq("id", orderId)
    .eq("status", "REQUESTED");
  if (updateErr) {
    console.error("rebroadcast: broadcast_radius_km 갱신 실패", updateErr);
    return;
  }

  const { data: riders, error: riderErr } = await admin.rpc("fn_find_eligible_riders", {
    p_lat: point.lat,
    p_lng: point.lng,
    p_radius_km: radiusKm,
  });
  if (riderErr) {
    console.error("rebroadcast: 라이더 검색 실패", riderErr);
    return;
  }
  const riderIds = (riders ?? []).map((r: { rider_id: string }) => r.rider_id);
  if (riderIds.length > 0) {
    await sendPush(
      admin,
      riderIds,
      "신규 콜 도착",
      `근처(${radiusKm}km)에 새 수거 요청이 있어요.`,
      `/orders/${orderId}`,
    );
  }
}

async function cancelNoRider(
  admin: SupabaseClient,
  orderId: string,
  supplierId: string,
): Promise<void> {
  // 30분 무수락 자동 취소는 "시스템" 액터 — fn_transition_order의 CANCEL 액션은
  // REQUESTED+supplier 또는 ACCEPTED+admin만 허용하므로, 여기서는 RPC를 거치지 않고
  // service_role로 직접 상태를 CANCELLED로 전이한다(00-domain.md "REQUESTED→CANCELLED,
  // supplier 또는 시스템" 행 — 트리거가 "시스템"인 유일한 자동 전이).
  const { data: cancelledOrder, error } = await admin
    .from("pickup_orders")
    .update({ status: "CANCELLED", cancel_reason: "NO_RIDER" })
    .eq("id", orderId)
    .eq("status", "REQUESTED")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("cancelNoRider: 취소 실패", error);
    return;
  }
  if (!cancelledOrder) return; // 이미 다른 처리로 상태가 바뀐 경우(레이스) — 조용히 스킵.

  const { error: eventErr } = await admin.from("order_events").insert({
    order_id: orderId,
    from_status: "REQUESTED",
    to_status: "CANCELLED",
    actor_id: null,
    payload: { reason: "NO_RIDER" },
  });
  if (eventErr) {
    console.error("cancelNoRider: order_events insert 실패", eventErr);
  }

  await sendPush(
    admin,
    [supplierId],
    "자동 취소",
    "수락한 라이더가 없어 요청이 자동 취소되었어요.",
    `/orders/${orderId}`,
  );

  // admin 알림(00-domain.md "30분 무수락 취소" 행 — admin(웹 알림)도 대상).
  const { data: admins, error: adminErr } = await admin.from("profiles").select("id").eq("role", "admin");
  if (!adminErr && admins) {
    const adminIds = admins.map((a: { id: string }) => a.id);
    await sendPush(admin, adminIds, "무수락 자동 취소", `주문 ${orderId}가 자동 취소됐어요.`, `/orders/${orderId}`);
  }
}

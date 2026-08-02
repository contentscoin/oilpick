// order-expire (cron, 1분마다). docs/spec/02-api.md "4. order-expire":
// ① REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km,
//    30분→자동 CANCELLED(사유 NO_RIDER). broadcast_radius_km 컬럼으로 현재 단계 추적.
// ② [16 L5] ARRIVED + 계량 제출됨(measured_kg not null) 확인 리마인드: 제출 후 2h/12h →
//    supplier 재촉 푸시, 24h → admin 에스컬레이션(기존 OrdersPage 24h 하이라이트의 능동화).
//    기산점 = order_events 최근 SUBMIT_MEASURE(payload.measuredKg 보유 행, L-D4 — 신규 컬럼 없음).
//    중복 발화 방지 = notifications 발송 이력 기반 사다리 판정(ladderShouldSend, 순수 함수 —
//    deno test로 고정). **상태는 일절 바꾸지 않는다**(16 §0-1 — 순수 알림).
//
// 실제 스케줄링 배선(pg_cron 등)은 배포 시점 설정이라 이 태스크 범위 밖 — 로컬에서는 curl로
// 직접 호출해 로직만 검증한다(태스크 지시사항). 취소는 fn_transition_order의 CANCEL 액션에 위임
// (시스템 자동취소 경로는 20260704000006_rpc_system_cancel.sql에서 actor_id=NULL/actor_role=NULL
// 조합으로 RPC에 추가됨 — 상태머신은 항상 이 RPC를 통해서만 변경한다).

import { NOTIFY_KIND } from "@oilpick/core/index.ts";
import { AuthError, requireCronAuth } from "../_shared/auth.ts";
import { ladderShouldSend } from "../_shared/notifyDedupe.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const STAGE_7KM_AFTER_MIN = 5;
const STAGE_15KM_AFTER_MIN = 10;
const CANCEL_AFTER_MIN = 30;

const HOUR_MS = 60 * 60 * 1000;
/** [16 L5] supplier 자동 리마인드 사다리(제출 후 2h/12h) — 16 §10-1 권고 기본값. */
const REMIND_STAGES_MS = [2 * HOUR_MS, 12 * HOUR_MS];
/** [16 L5] admin 에스컬레이션(제출 후 24h) — 기존 24h 하이라이트(ARRIVED_STALE_MS)와 동일 기준. */
const ESCALATE_STAGES_MS = [24 * HOUR_MS];

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    // cron(서버 간) 호출 전제 — [16 L10] service_role 키 직접 인정(requireCronAuth).
    // 기존 requireAuth(user JWT 전용)로는 DEPLOY §1-4 배선이 매 주기 401로 죽었다(확정 결함).
    let ctx;
    try {
      ctx = await requireCronAuth(req);
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

    // ── [16 L5] ARRIVED 확인 리마인드·에스컬레이션(상태 무접촉 — 푸시만) ──
    const { reminded, escalated } = await remindPendingConfirms(admin, now);

    return okResponse({ rebroadcasted, cancelled, reminded, escalated });
  })
);

/**
 * [16 L5] 계량 제출 후 미확인(ARRIVED ∧ measured_kg not null) 주문의 확인 리마인드.
 * DISPUTED는 제외 — 분쟁 중 재촉은 부적절(중재 대기). 자동 리마인드(kind=CONFIRM_REMIND_AUTO)
 * 카운트에는 라이더 수동 재요청(CONFIRM_REMIND_MANUAL)이 섞이지 않는다(kind 필터).
 */
async function remindPendingConfirms(
  admin: SupabaseClient,
  now: Date,
): Promise<{ reminded: number; escalated: number }> {
  let reminded = 0;
  let escalated = 0;

  const { data: waiting, error: waitingErr } = await admin
    .from("pickup_orders")
    .select("id, supplier_id")
    .eq("status", "ARRIVED")
    .not("measured_kg", "is", null);
  if (waitingErr) {
    console.error("remindPendingConfirms: 대기 주문 조회 실패", waitingErr);
    return { reminded, escalated };
  }
  const orders = waiting ?? [];
  if (orders.length === 0) return { reminded, escalated };

  // 기산점: 주문별 최근 SUBMIT_MEASURE 이벤트(payload.measuredKg 보유). 재제출이 기산점을
  // 갱신하면 사다리도 처음부터 다시 돈다(ladderShouldSend가 기산점 이전 발송분을 무시).
  const { data: events, error: evErr } = await admin
    .from("order_events")
    .select("order_id, created_at")
    .in("order_id", orders.map((o: { id: string }) => o.id))
    .not("payload->>measuredKg", "is", null)
    .order("created_at", { ascending: false });
  if (evErr) {
    console.error("remindPendingConfirms: 기산점 조회 실패", evErr);
    return { reminded, escalated };
  }
  const anchorByOrder = new Map<string, number>();
  for (const ev of events ?? []) {
    if (!anchorByOrder.has(ev.order_id)) anchorByOrder.set(ev.order_id, Date.parse(ev.created_at));
  }

  // 에스컬레이션 수신자(admin 전원) — 대상이 있을 때만 1회 조회(지연 로드).
  let adminIds: string[] | null = null;

  for (const order of orders) {
    const anchor = anchorByOrder.get(order.id);
    if (anchor == null || !Number.isFinite(anchor)) continue;
    const link = `/orders/${order.id}`;

    // supplier 2h/12h 자동 리마인드.
    const { data: remindRows, error: remindErr } = await admin
      .from("notifications")
      .select("created_at")
      .eq("user_id", order.supplier_id)
      .eq("kind", NOTIFY_KIND.CONFIRM_REMIND_AUTO)
      .eq("link", link)
      .gte("created_at", new Date(anchor).toISOString());
    if (!remindErr && ladderShouldSend(remindRows ?? [], anchor, REMIND_STAGES_MS, now)) {
      await sendPush(
        admin,
        [order.supplier_id],
        "수거 확인 요청",
        "수거 확인이 기다리고 있어요 — 확인하면 지급이 확정돼요.",
        link,
        undefined,
        NOTIFY_KIND.CONFIRM_REMIND_AUTO,
      );
      reminded++;
    }

    // admin 24h 에스컬레이션 — 수신자 무관 kind+link로 1회만(admin 여러 명이어도 1라운드).
    const { data: escRows, error: escErr } = await admin
      .from("notifications")
      .select("created_at")
      .eq("kind", NOTIFY_KIND.CONFIRM_ESCALATION)
      .eq("link", link)
      .gte("created_at", new Date(anchor).toISOString());
    if (!escErr && ladderShouldSend(escRows ?? [], anchor, ESCALATE_STAGES_MS, now)) {
      if (adminIds === null) {
        const { data: admins, error: adminErr } = await admin
          .from("profiles")
          .select("id")
          .eq("role", "admin");
        adminIds = adminErr || !admins ? [] : admins.map((a: { id: string }) => a.id);
      }
      if (adminIds.length > 0) {
        await sendPush(
          admin,
          adminIds,
          "확인 지연 24시간",
          "계량 제출 후 24시간째 점주 확인이 없어요 — 중재 또는 완료 처리 검토가 필요해요.",
          link,
          undefined,
          NOTIFY_KIND.CONFIRM_ESCALATION,
        );
        escalated++;
      }
    }
  }

  return { reminded, escalated };
}

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
      "NEW_CALL", // 재브로드캐스트도 신규 콜 — rider foreground 콜 배너 분류(06 E3)
    );
  }
}

async function cancelNoRider(
  admin: SupabaseClient,
  orderId: string,
  supplierId: string,
): Promise<void> {
  // 30분 무수락 자동 취소는 "시스템" 액터(00-domain.md:30 "REQUESTED→CANCELLED, supplier 또는
  // 시스템"). fn_transition_order의 CANCEL 액션은 20260704000006_rpc_system_cancel.sql에서
  // p_actor_id=NULL & p_actor_role=NULL 조합을 시스템 취소 경로로 인식하도록 확장됐다 —
  // 상태전이/order_events insert는 모두 RPC 내부에서 트랜잭션으로 처리된다(재구현하지 않음).
  const { data: order, error: rpcErr } = await admin.rpc("fn_transition_order", {
    p_order_id: orderId,
    p_action: "CANCEL",
    p_actor_id: null,
    p_actor_role: null,
    p_payload: { reason: "NO_RIDER" },
  });

  if (rpcErr) {
    const message = rpcErr.message ?? "";
    if (message.includes("INVALID_TRANSITION") || message.includes("NOT_FOUND")) {
      // 이미 다른 처리(수락/취소 등)로 상태가 바뀐 경우(레이스) — 조용히 스킵.
      return;
    }
    console.error("cancelNoRider: 취소 실패", rpcErr);
    return;
  }
  if (!order) return;

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

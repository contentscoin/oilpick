// rider-location (rider). docs/spec/02-api.md "5. rider-location (rider)":
// - 입력: { lat, lng } — 운행 중(ACCEPTED~PICKED_UP 보유) 15초 간격 호출.
// - 처리: rider_profiles.last_location 갱신. 진행중 주문 있으면 Realtime broadcast 채널
//   `order:{orderId}:location`으로 좌표 push (supplier 지도용).
//
// "진행중 주문(ACCEPTED~PICKED_UP)이 있을 때만 last_location 갱신을 허용"(태스크 지시) —
// 진행중 주문이 없으면 400으로 거부한다(위치 갱신은 실제 운행 중에만 의미가 있고, 무제한 허용
// 시 인증 없는 위치 추적 오남용 우려도 줄인다).

import { riderLocationInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

const ACTIVE_STATUSES = ["ACCEPTED", "ARRIVED", "PICKED_UP"];

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
    const parsed = riderLocationInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { lat, lng } = parsed.data;

    // 진행중(ACCEPTED~PICKED_UP) 주문이 있을 때만 위치 갱신을 허용한다(태스크 지시사항).
    const { data: activeOrder, error: activeErr } = await admin
      .from("pickup_orders")
      .select("id")
      .eq("rider_id", uid)
      .in("status", ACTIVE_STATUSES)
      .maybeSingle();
    if (activeErr) throw activeErr;
    if (!activeOrder) {
      return errorResponse("VALIDATION_ERROR", 400, "운행 중인 주문이 있을 때만 위치를 갱신할 수 있어요.");
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("rider_profiles")
      .update({
        last_location: `SRID=4326;POINT(${lng} ${lat})`,
        last_location_at: nowIso,
      })
      .eq("id", uid);
    if (updateErr) throw updateErr;

    // Realtime broadcast 채널 order:{orderId}:location으로 좌표 push (supplier 지도용).
    // DB 변경이 아니라 순수 브로드캐스트이므로 실패해도 위치 저장(핵심 결과)에는 영향 없다.
    try {
      const channel = admin.channel(`order:${activeOrder.id}:location`);
      await channel.send({
        type: "broadcast",
        event: "location",
        payload: { lat, lng, updatedAt: nowIso },
      });
      await admin.removeChannel(channel);
    } catch (err) {
      console.error("rider-location: realtime broadcast 실패(위치 저장에는 영향 없음)", err);
    }

    return okResponse({ updatedAt: nowIso });
  })
);

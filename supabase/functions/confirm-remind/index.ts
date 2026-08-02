// [16 L5] confirm-remind — 라이더 [확인 요청 다시 보내기]. docs/spec/16-ops-convenience.md §4,
// 02-api.md "confirm-remind" 절.
//
// 계량 제출 후 supplier 확인(CONFIRM_MEASURE)이 늦어질 때, 주문 당사자 라이더가 supplier에게
// 확인 요청 푸시를 1회 재발송한다. **상태는 절대 바꾸지 않는다**(16 §0-1 — pickup_orders를
// 일절 update하지 않는 순수 알림 EF. 교착 해소는 여전히 supplier CONFIRM / admin FORCE_COMPLETE).
// 카피는 최초 SUBMIT_MEASURE 통지와 동일(_shared/orderNotify.ts — 00 알림 매트릭스 단일 진실).
// rate limit: 주문당 2시간 1회 — sendPushDeduped(kind=CONFIRM_REMIND_MANUAL, link=/orders/:id)가
// 서버에서 강제(클라 버튼 비활성은 보조). 스킵이면 { sent: false }(에러 아님 — 클라 카피 분기).

import { confirmRemindInputSchema, NOTIFY_KIND } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { submitMeasureNotification } from "../_shared/orderNotify.ts";
import { sendPushDeduped } from "../_shared/push.ts";

/** 주문당 수동 리마인드 최소 간격(2시간) — 16 §10-1 권고 기본값. */
const MANUAL_REMIND_WINDOW_MS = 2 * 60 * 60 * 1000;

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
    const { admin, uid } = ctx;

    const parsed = confirmRemindInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, "요청 형식이 올바르지 않아요.");
    }
    const { orderId } = parsed.data;

    const { data: order, error } = await admin
      .from("pickup_orders")
      .select(
        "id, rider_id, supplier_id, status, measured_kg, snapshot_price_per_kg, delivered_cans, snapshot_fresh_can_price, payout_method",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) return errorResponse("NOT_FOUND", 404, "주문을 찾을 수 없어요.");
    // 주문 당사자(배정 라이더) 검증 — RLS와 별개로 서버에서 이중 방어(13 패턴).
    if (order.rider_id !== uid) {
      return errorResponse("FORBIDDEN", 403, "본인이 배정된 주문만 요청할 수 있어요.");
    }
    // 계량 제출 후 확인 대기 상태에서만 의미가 있다.
    if (order.status !== "ARRIVED" || order.measured_kg == null) {
      return errorResponse("INVALID_TRANSITION", 409, "확인 대기 상태의 주문이 아니에요.");
    }

    const { title, body } = submitMeasureNotification(order);
    const sent = await sendPushDeduped(admin, {
      userId: order.supplier_id,
      kind: NOTIFY_KIND.CONFIRM_REMIND_MANUAL,
      title,
      body,
      link: `/orders/${orderId}`,
      windowMs: MANUAL_REMIND_WINDOW_MS,
    });

    return okResponse({ sent });
  })
);

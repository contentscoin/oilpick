// [N3, 08 P2 확장] payout-change-request — 점주 [현금 지급으로 변경 요청].
// docs/spec/08-payout-pivot.md P2 확장(2026-08-05), 02-api.md "payout-change-request" 절.
//
// 계량이 POINT 지급으로 제출돼 확인 대기 중일 때(또는 포인트 잔액 부족으로 상계 결제가
// 실패했을 때), 주문 당사자 supplier가 라이더에게 "현금 지급으로 다시 제출해 달라"는
// 푸시를 보낸다. **상태는 절대 바꾸지 않는다** — confirm-remind와 동일한 순수 알림 EF
// (16 §0-1). 실제 수단 변경은 여전히 라이더의 재제출(SUBMIT_MEASURE, 00-domain: final_kg
// 고정 전 재제출로 수단 변경 가능)로만 일어난다(2자 확인 원칙 유지).
// rate limit: 주문당 2시간 1회 — sendPushDeduped(kind=PAYOUT_CHANGE_REQUEST)가 서버에서
// 강제(클라 버튼 비활성은 보조). 스킵이면 { sent: false }(에러 아님 — 클라 카피 분기).

import { NOTIFY_KIND, payoutChangeRequestInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPushDeduped } from "../_shared/push.ts";

/** 주문당 변경 요청 최소 간격(2시간) — confirm-remind와 동일 권고 기본값(16 §10-1). */
const REQUEST_WINDOW_MS = 2 * 60 * 60 * 1000;

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
    const { admin, uid } = ctx;

    const parsed = payoutChangeRequestInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, "요청 형식이 올바르지 않아요.");
    }
    const { orderId } = parsed.data;

    const { data: order, error } = await admin
      .from("pickup_orders")
      .select("id, rider_id, supplier_id, status, measured_kg, payout_method")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) return errorResponse("NOT_FOUND", 404, "주문을 찾을 수 없어요.");
    // 주문 당사자(요청 점주) 검증 — RLS와 별개로 서버에서 이중 방어(13 패턴).
    if (order.supplier_id !== uid) {
      return errorResponse("FORBIDDEN", 403, "본인 주문만 요청할 수 있어요.");
    }
    if (!order.rider_id) {
      return errorResponse("INVALID_TRANSITION", 409, "배정된 라이더가 없는 주문이에요.");
    }
    // 계량 제출 후 확인 대기 + POINT 지급으로 제출된 주문에서만 의미가 있다.
    if (order.status !== "ARRIVED" || order.measured_kg == null) {
      return errorResponse("INVALID_TRANSITION", 409, "확인 대기 상태의 주문이 아니에요.");
    }
    if (order.payout_method !== "POINT") {
      return errorResponse("INVALID_TRANSITION", 409, "포인트 지급으로 제출된 주문이 아니에요.");
    }

    const sent = await sendPushDeduped(admin, {
      userId: order.rider_id,
      kind: NOTIFY_KIND.PAYOUT_CHANGE_REQUEST,
      title: "현금 지급 변경 요청",
      body: "사장님이 포인트 대신 현금 지급을 요청했어요 — 운행 화면에서 [현금으로 바꿔 다시 제출]로 변경할 수 있어요.",
      link: "/active",
      windowMs: REQUEST_WINDOW_MS,
    });

    return okResponse({ sent });
  })
);

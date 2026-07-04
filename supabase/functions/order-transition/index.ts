// order-transition (rider/supplier/admin). docs/spec/02-api.md "3. order-transition":
// ACCEPTED 이후 모든 전이 단일 엔드포인트. action별 처리는 fn_transition_order RPC에 위임하고
// 이 함수는 입력 검증 + role 확인 + RPC 호출 + 에러 매핑 + 알림 매트릭스(00-domain.md) 발송만
// 담당한다 — 상태머신/원장 로직을 TypeScript로 재구현하지 않는다.

import { orderTransitionInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// action별 허용 role. 02-api.md order-transition 표 "actor" 열.
// RESOLVE_DISPUTE/CANCEL(admin분기)은 admin, DISPUTE/CONFIRM_MEASURE는 supplier,
// 나머지(ARRIVE/SUBMIT_MEASURE/DELIVER)는 rider. CANCEL은 supplier/admin 둘 다 가능
// (REQUESTED는 supplier, ACCEPTED는 admin — RPC 내부에서 from 상태별로 다시 검증).
const ALLOWED_ROLES: Record<string, Array<"rider" | "supplier" | "admin">> = {
  ARRIVE: ["rider"],
  SUBMIT_MEASURE: ["rider"],
  CONFIRM_MEASURE: ["supplier"],
  DISPUTE: ["supplier"],
  RESOLVE_DISPUTE: ["admin"],
  DELIVER: ["rider"],
  CANCEL: ["supplier", "admin"],
};

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, role, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = orderTransitionInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { orderId, action, payload } = parsed.data;

    const allowedRoles = ALLOWED_ROLES[action];
    if (!allowedRoles?.includes(role)) {
      return errorResponse("FORBIDDEN", 403);
    }

    // 전이 전 상태(from) — 알림 매트릭스 분기(CANCEL의 supplier/rider 대상 결정)에 필요.
    const { data: before, error: beforeErr } = await admin
      .from("pickup_orders")
      .select("supplier_id, rider_id")
      .eq("id", orderId)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return errorResponse("NOT_FOUND", 404);

    const { data: order, error: rpcErr } = await admin.rpc("fn_transition_order", {
      p_order_id: orderId,
      p_action: action,
      p_actor_id: uid,
      p_actor_role: role,
      p_payload: payload ?? {},
    });

    if (rpcErr) {
      return mapTransitionError(rpcErr);
    }
    if (!order) {
      return errorResponse("NOT_FOUND", 404);
    }

    await notifyForAction(admin, action, order, before);

    return okResponse({ orderId: order.id, status: order.status });
  })
);

function mapTransitionError(rpcErr: { message?: string }): Response {
  const message = rpcErr.message ?? "";
  if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
  if (message.includes("INVALID_QR")) return errorResponse("INVALID_QR", 400);
  if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
  if (message.includes("ALREADY_ACCEPTED")) return errorResponse("ALREADY_ACCEPTED", 409);
  if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
  console.error("order-transition: 예기치 못한 RPC 에러", rpcErr);
  return errorResponse("INVALID_TRANSITION", 409, message || undefined);
}

/**
 * 알림 매트릭스(00-domain.md "알림 매트릭스" 표)에 맞는 상대방에게 push.
 * order-transition 액션별 대상:
 *  - ARRIVE: supplier ("도착")
 *  - SUBMIT_MEASURE: supplier ("계량 확인 요청")
 *  - CONFIRM_MEASURE: supplier("포인트 지급") + rider(계량 확정 알림)
 *  - DISPUTE: admin에게는 웹 알림(notifications만, FCM 대상 아님) — 여기선 rider에게 안내
 *  - RESOLVE_DISPUTE: CONFIRM_MEASURE와 동일(양쪽 지급 알림)
 *  - DELIVER: rider ("배송완료/RELEASE")
 *  - CANCEL: supplier(REQUESTED 취소 시 본인 확인) / rider(ACCEPTED 이후 admin 취소 시 안내)
 */
async function notifyForAction(
  admin: SupabaseClient,
  action: string,
  order: { id: string; supplier_id: string; rider_id: string | null },
  before: { supplier_id: string; rider_id: string | null },
): Promise<void> {
  const link = `/orders/${order.id}`;
  switch (action) {
    case "ARRIVE":
      await sendPush(admin, [order.supplier_id], "라이더 도착", "라이더가 현장에 도착했어요.", link);
      break;
    case "SUBMIT_MEASURE":
      await sendPush(
        admin,
        [order.supplier_id],
        "계량 확인 요청",
        "계량 결과를 확인하고 승인해주세요.",
        link,
      );
      break;
    case "CONFIRM_MEASURE":
    case "RESOLVE_DISPUTE":
      await sendPush(admin, [order.supplier_id], "포인트 지급", "수거 대금이 지급되었어요.", link);
      if (order.rider_id) {
        await sendPush(admin, [order.rider_id], "계량 확정", "계량이 확정되어 수거비가 보류 지급됐어요.", link);
      }
      break;
    case "DISPUTE":
      // admin 알림은 notifications(웹 알림)만 — 00-domain.md 알림 매트릭스 "이의신청" 행.
      await notifyAdmins(admin, "이의신청 접수", "계량 이의신청이 접수됐어요.", link);
      break;
    case "DELIVER":
      if (order.rider_id) {
        await sendPush(admin, [order.rider_id], "배송완료", "집하장 배송이 완료되어 수거비가 지급됐어요.", link);
      }
      break;
    case "CANCEL":
      await sendPush(admin, [before.supplier_id], "주문 취소", "주문이 취소되었어요.", link);
      if (before.rider_id) {
        await sendPush(admin, [before.rider_id], "주문 취소", "배정된 주문이 취소되었어요.", link);
      }
      break;
    default:
      break;
  }
}

async function notifyAdmins(
  admin: SupabaseClient,
  title: string,
  body: string,
  link: string,
): Promise<void> {
  const { data: admins, error } = await admin.from("profiles").select("id").eq("role", "admin");
  if (error) {
    console.error("admin 목록 조회 실패", error);
    return;
  }
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id);
  await sendPush(admin, adminIds, title, body, link);
}

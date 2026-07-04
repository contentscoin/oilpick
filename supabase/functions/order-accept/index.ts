// order-accept (rider). docs/spec/02-api.md "2. order-accept (rider)":
// - 입력: { orderId }
// - 가드: verified·online·진행중 주문 없음. 아니면 403 RIDER_NOT_ELIGIBLE.
// - 동시성: fn_transition_order의 ACCEPT 액션(조건부 UPDATE)이 이미 보장 — 0행이면 예외를
//   던지고 이 함수는 그 예외를 409 ALREADY_ACCEPTED로 매핑만 한다.
// - 부수효과: order_events, supplier 푸시(RPC 내부에서 order_events는 이미 insert됨).
//
// CLAUDE.md/태스크 지시: Edge Function은 RPC 결과를 응답으로 변환만 하고 상태머신/원장
// 로직을 TypeScript로 재구현하지 않는다.

import { orderAcceptInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";

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
    const parsed = orderAcceptInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { orderId } = parsed.data;

    // 가드: verified·online·진행중 주문 없음 (02-api.md order-accept). 아니면 403 RIDER_NOT_ELIGIBLE.
    const { data: riderProfile, error: riderErr } = await admin
      .from("rider_profiles")
      .select("verify_status, is_online")
      .eq("id", uid)
      .maybeSingle();
    if (riderErr) throw riderErr;
    if (!riderProfile || riderProfile.verify_status !== "APPROVED" || !riderProfile.is_online) {
      return errorResponse("RIDER_NOT_ELIGIBLE", 403);
    }

    const { count: activeCount, error: activeErr } = await admin
      .from("pickup_orders")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", uid)
      .in("status", ["ACCEPTED", "ARRIVED", "PICKED_UP"]);
    if (activeErr) throw activeErr;
    if ((activeCount ?? 0) > 0) {
      return errorResponse("RIDER_NOT_ELIGIBLE", 403);
    }

    // 동시성 보장(선착순 조건부 UPDATE)은 fn_transition_order 내부(ACCEPT 액션)에 이미 구현됨.
    const { data: order, error: rpcErr } = await admin.rpc("fn_transition_order", {
      p_order_id: orderId,
      p_action: "ACCEPT",
      p_actor_id: uid,
      p_actor_role: "rider",
      p_payload: {},
    });

    if (rpcErr) {
      return mapTransitionError(rpcErr);
    }
    if (!order) {
      return errorResponse("NOT_FOUND", 404);
    }

    await sendPush(
      admin,
      [order.supplier_id],
      "라이더 배정",
      "라이더가 배정되었어요.",
      `/orders/${orderId}`,
    );

    return okResponse({
      orderId: order.id,
      status: order.status,
      acceptedAt: order.accepted_at,
    });
  })
);

function mapTransitionError(rpcErr: { message?: string }): Response {
  const message = rpcErr.message ?? "";
  if (message.includes("ALREADY_ACCEPTED")) return errorResponse("ALREADY_ACCEPTED", 409);
  if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
  if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
  console.error("order-accept: 예기치 못한 RPC 에러", rpcErr);
  return errorResponse("INVALID_TRANSITION", 409, message || undefined);
}

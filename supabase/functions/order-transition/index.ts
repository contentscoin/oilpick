// order-transition (rider/supplier/admin). docs/spec/02-api.md "3. order-transition":
// ACCEPTED 이후 모든 전이 단일 엔드포인트. action별 처리는 fn_transition_order RPC에 위임하고
// 이 함수는 입력 검증 + role 확인 + RPC 호출(6-인자, p_fault 포함) + 에러 매핑 + 알림 매트릭스
// (00-domain.md §알림 매트릭스, 08 §1-5 — 지급수단별 카피 분기) 발송만 담당한다 — 상태머신/원장
// 로직을 재구현하지 않는다.

import {
  orderTransitionInputSchema,
  formatKrw,
  formatKg,
  formatPoint,
  estimateCash,
} from "@oilpick/core/index.ts";
import { AuthError, requireAuth } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// action별 허용 role. 02-api.md order-transition 표 "actor" 열.
// FORCE_COMPLETE/RESOLVE_DISPUTE는 admin, DISPUTE/CONFIRM_MEASURE는 supplier,
// ARRIVE/SUBMIT_MEASURE/DELIVER는 rider. CANCEL은 supplier/admin 둘 다(REQUESTED는 supplier,
// {ACCEPTED|ARRIVED|DISPUTED}는 admin+fault — RPC 내부에서 from 상태·fault를 다시 검증).
const ALLOWED_ROLES: Record<string, Array<"rider" | "supplier" | "admin">> = {
  ARRIVE: ["rider"],
  SUBMIT_MEASURE: ["rider"],
  CONFIRM_MEASURE: ["supplier"],
  DISPUTE: ["supplier"],
  RESOLVE_DISPUTE: ["admin"],
  FORCE_COMPLETE: ["admin"],
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

    // admin CANCEL의 귀책(fault)은 RPC의 별도 인자(p_fault). 값 범위는 zod가, 필수 여부는 RPC가 검증.
    const fault = parsed.data.action === "CANCEL" ? parsed.data.payload.fault ?? null : null;

    // 전이 전 상태(from) — 알림 매트릭스 분기(CANCEL 대상 결정)에 필요.
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
      p_fault: fault,
    });

    if (rpcErr) {
      return mapTransitionError(rpcErr);
    }
    if (!order) {
      return errorResponse("NOT_FOUND", 404);
    }

    await notifyForAction(admin, action, order as TransitionOrder, before, fault);

    return okResponse({ orderId: order.id, status: order.status });
  })
);

function mapTransitionError(rpcErr: { message?: string }): Response {
  const message = rpcErr.message ?? "";
  if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
  if (message.includes("INVALID_QR")) return errorResponse("INVALID_QR", 400);
  if (message.includes("INSUFFICIENT_COUPON")) return errorResponse("INSUFFICIENT_COUPON", 409);
  if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
  if (message.includes("ALREADY_ACCEPTED")) return errorResponse("ALREADY_ACCEPTED", 409);
  if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
  console.error("order-transition: 예기치 못한 RPC 에러", rpcErr);
  return errorResponse("INVALID_TRANSITION", 409, message || undefined);
}

// ===================== 알림 매트릭스 (순수 헬퍼) =====================
// 00-domain.md §알림 매트릭스(08 §1-5)를 단일 진실로, action×수신자×카피를 순수 함수로 산출한다.
// (DoD F3b-③: Deno 테스트 선례가 없어 분기 로직을 순수 헬퍼로 분리 — I/O(sendPush)는 dispatcher가 담당.)

/** RPC가 반환하는 pickup_orders 행 중 알림에 필요한 필드. numeric은 문자열로 올 수 있어 Number()로 정규화. */
export interface TransitionOrder {
  id: string;
  supplier_id: string;
  rider_id: string | null;
  coupon_cost: number | null;
  payout_method: "CASH" | "POINT" | null;
  cash_paid_amount: number | null;
  final_kg: number | string | null;
  measured_kg: number | string | null;
  snapshot_price_per_kg: number;
}

interface BeforeOrder {
  supplier_id: string;
  rider_id: string | null;
}

type Fault = "SUPPLIER" | "RIDER" | "SYSTEM" | null;

/** 대상 유저에게 보내는 푸시 1건. userIds에서 falsy(널 rider 등)는 dispatcher가 걸러낸다. */
interface PushSpec {
  kind: "push";
  userIds: Array<string | null>;
  title: string;
  body: string;
  /** 기본은 주문 상세(/orders/:id). 포인트 적립 통지 등은 지갑으로 딥링크(08 §1-5). */
  link?: string;
}

/** admin 웹 알림(notifications) — FCM 대상 아님(00-domain.md "이의신청" 행). */
interface AdminSpec {
  kind: "admin";
  title: string;
  body: string;
}

export type NotificationSpec = PushSpec | AdminSpec;

/**
 * action×수신자×카피 매트릭스를 산출하는 순수 함수(부수효과 없음).
 * 금액·쿠폰 수는 주문 행에서 계산(cash_paid_amount, coupon_cost, kg×스냅샷시세).
 */
export function buildActionNotifications(
  action: string,
  order: TransitionOrder,
  before: BeforeOrder,
  fault: Fault,
): NotificationSpec[] {
  switch (action) {
    case "ARRIVE":
      // 기존 유지: 도착 기본 통지(supplier).
      return [
        { kind: "push", userIds: [order.supplier_id], title: "라이더 도착", body: "라이더가 현장에 도착했어요." },
      ];

    case "SUBMIT_MEASURE": {
      // supplier 카피는 지급수단별 분기(08 §1-5). N = round(계량kg × 스냅샷시세).
      const kg = Number(order.measured_kg ?? 0);
      const amount = estimateCash(kg, order.snapshot_price_per_kg);
      const isPoint = order.payout_method === "POINT";
      return [
        {
          kind: "push",
          userIds: [order.supplier_id],
          title: "계량 결과 도착",
          body: isPoint
            ? `계량 결과가 도착했어요 — 무게 ${formatKg(kg)}, 확인하시면 포인트 ${formatPoint(amount)}가 적립돼요.`
            : `계량 결과가 도착했어요 — 무게 ${formatKg(kg)}·현금 ${formatKrw(amount)}을 확인해 주세요.`,
        },
      ];
    }

    case "CONFIRM_MEASURE": {
      // 완료. 지급수단별 분기(08 §1-5). N = cash_paid_amount(확정 지급액 — POINT면 적립 P).
      const amount = order.cash_paid_amount ?? 0;
      if (order.payout_method === "POINT") {
        return [
          {
            kind: "push",
            userIds: [order.rider_id],
            title: "수거 완료",
            body: `수거 완료 — 포인트 ${formatPoint(amount)} 지급이 확인됐어요.`,
          },
          {
            kind: "push",
            userIds: [order.supplier_id],
            title: "포인트 적립",
            body: `포인트 ${formatPoint(amount)}가 적립됐어요 — 지갑에서 출금 신청할 수 있어요.`,
            link: "/wallet",
          },
        ];
      }
      return [
        {
          kind: "push",
          userIds: [order.rider_id],
          title: "수거 완료",
          body: `수거 완료 — 현금 ${formatKrw(amount)} 지급이 확인됐어요.`,
        },
      ];
    }

    case "FORCE_COMPLETE": {
      // supplier + rider: "관리자 확인으로 주문이 완료 처리됐어요". POINT면 supplier 적립 카피 병기(08 §1-5).
      const specs: NotificationSpec[] = [
        {
          kind: "push",
          userIds: [order.supplier_id, order.rider_id],
          title: "주문 완료",
          body: "관리자 확인으로 주문이 완료 처리됐어요.",
        },
      ];
      if (order.payout_method === "POINT") {
        const amount = order.cash_paid_amount ?? 0;
        specs.push({
          kind: "push",
          userIds: [order.supplier_id],
          title: "포인트 적립",
          body: `포인트 ${formatPoint(amount)}가 적립됐어요 — 지갑에서 출금 신청할 수 있어요.`,
          link: "/wallet",
        });
      }
      return specs;
    }

    case "RESOLVE_DISPUTE": {
      // supplier + rider: "이의신청 중재 결과: 확정 무게 O.Okg".
      const kg = Number(order.final_kg ?? 0);
      return [
        {
          kind: "push",
          userIds: [order.supplier_id, order.rider_id],
          title: "이의신청 중재 결과",
          body: `이의신청 중재 결과: 확정 무게 ${formatKg(kg)}.`,
        },
      ];
    }

    case "DISPUTE":
      // admin 웹 알림만(기존 유지).
      return [{ kind: "admin", title: "이의신청 접수", body: "계량 이의신청이 접수됐어요." }];

    case "CANCEL": {
      // [08 P1 레거시] 쿠폰 환급 카피는 잔존 쿠폰 주문(coupon_cost not null)에서만 — 신규 주문은
      // coupon_cost null이라 아래 일반 취소 통지로 떨어진다.
      const refunded =
        fault !== null &&
        (fault === "SUPPLIER" || fault === "SYSTEM") &&
        order.coupon_cost != null &&
        order.rider_id != null;
      if (refunded) {
        // fault=SUPPLIER/SYSTEM: rider "쿠폰 N장 환급" + supplier 취소 통지.
        return [
          {
            kind: "push",
            userIds: [order.rider_id],
            title: "주문 취소",
            body: `주문 취소 — 쿠폰 ${order.coupon_cost}장이 환급되었어요.`,
          },
          { kind: "push", userIds: [before.supplier_id], title: "주문 취소", body: "주문이 취소되었어요." },
        ];
      }
      // supplier 자진취소 / fault=RIDER / 레거시(coupon_cost null): 환급 문구 없는 취소 통지.
      return [
        {
          kind: "push",
          userIds: [before.supplier_id, before.rider_id],
          title: "주문 취소",
          body: "주문이 취소되었어요.",
        },
      ];
    }

    case "DELIVER":
      // 레거시(PICKED_UP 잔존분) 완결 통지 — 수거비 카피 없음(07 §1-6에서 "배송완료" 행 삭제).
      return [
        {
          kind: "push",
          userIds: [order.rider_id],
          title: "주문 완료",
          body: "수거가 완료 처리됐어요.",
        },
      ];

    default:
      return [];
  }
}

/** 순수 매트릭스 결과를 실제 발송(push/admin 알림)으로 디스패치한다. */
async function notifyForAction(
  admin: SupabaseClient,
  action: string,
  order: TransitionOrder,
  before: BeforeOrder,
  fault: Fault,
): Promise<void> {
  const link = `/orders/${order.id}`;
  const specs = buildActionNotifications(action, order, before, fault);
  for (const spec of specs) {
    if (spec.kind === "admin") {
      await notifyAdmins(admin, spec.title, spec.body, link);
      continue;
    }
    const userIds = spec.userIds.filter((id): id is string => Boolean(id));
    if (userIds.length === 0) continue;
    await sendPush(admin, userIds, spec.title, spec.body, spec.link ?? link);
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

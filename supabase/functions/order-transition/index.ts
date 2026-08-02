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
import { submitMeasureNotification } from "../_shared/orderNotify.ts";
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

    // [09 H6·H7] 완료 전이 성공 후 추천 활성화 시도(멱등 no-op). fn_transition_order 본체는 무변경 —
    // 레퍼럴은 순수 추가라 상태머신을 오염시키지 않는다. 첫 수거 완료(COMPLETED 도달)에서만 발행된다.
    if ((order as TransitionOrder & { status?: string }).status === "COMPLETED") {
      await activateReferralIfAny(admin, (order as TransitionOrder).supplier_id, (order as TransitionOrder).id);
    }

    return okResponse({ orderId: order.id, status: order.status });
  })
);

/**
 * [09 H7] 완료된 주문의 점주에 대해 추천 활성화를 시도한다(fn_activate_referral, 멱등).
 * RPC는 추천 없음/이미 활성/취소면 null을 반환(no-op) — 그 경우 알림 없이 조용히 넘어간다.
 * 방금 SIGNED_UP→ACTIVATED로 전이된 경우에만 행이 반환되어 점주·라이더에게 1회 알림을 보낸다.
 * best-effort: 예외/실패는 로그만 남기고 전이 응답을 막지 않는다(핵심 로직 무영향).
 */
async function activateReferralIfAny(
  admin: SupabaseClient,
  supplierId: string,
  orderId: string,
): Promise<void> {
  try {
    const { data: referral, error } = await admin.rpc("fn_activate_referral", {
      p_supplier_id: supplierId,
      p_order_id: orderId,
    });
    if (error) {
      console.error("fn_activate_referral 실패 (핵심 로직 무영향)", error);
      return;
    }
    if (!referral) return; // 추천 없음/이미 활성 — no-op

    const bonus = Number(referral.supplier_bonus ?? 0);
    await sendPush(
      admin,
      [supplierId],
      "추천 보너스 적립",
      `추천 보너스 ${formatPoint(bonus)}가 적립됐어요 — 지갑에서 확인하세요.`,
      "/wallet",
    );
    if (referral.referrer_rider_id) {
      await sendPush(
        admin,
        [referral.referrer_rider_id],
        "추천 실적 적립",
        "회원님 추천으로 가입한 점주가 첫 수거를 완료했어요 — 추천 실적이 적립됐어요.",
        "/referrals",
      );
    }
  } catch (err) {
    console.error("추천 활성화 처리 중 예외 (핵심 로직 무영향)", err);
  }
}

function mapTransitionError(rpcErr: { message?: string }): Response {
  const message = rpcErr.message ?? "";
  if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
  if (message.includes("INVALID_QR")) return errorResponse("INVALID_QR", 400);
  // [14 J4] 상계 결제 실패 2종. INSUFFICIENT_COUPON 검사보다 앞에 둔다(부분일치 혼동 방지).
  // 둘 다 CONFIRM_MEASURE(점주)·FORCE_COMPLETE(admin)에서 fn_settle_trade가 raise한다.
  // 매핑이 없으면 폴백 INVALID_TRANSITION으로 뭉개져 점주가 원인을 알 수 없고, 주문이 ARRIVED에 묶인다.
  if (message.includes("INSUFFICIENT_BALANCE")) return errorResponse("INSUFFICIENT_BALANCE", 409);
  if (message.includes("DEALER_LIMIT_EXCEEDED")) return errorResponse("DEALER_LIMIT_EXCEEDED", 409);
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
  /** [14 J2] 폐유 총액(gross)으로 **동결**된 값 — 실지급액이 아니다. 상계 결과는 net_amount. */
  cash_paid_amount: number | null;
  final_kg: number | string | null;
  measured_kg: number | string | null;
  snapshot_price_per_kg: number;
  // [14 J2] 상계(netting). net_amount = cash_paid_amount − purchase_amount, 음수 가능(점주가 지불).
  // 레거시 주문은 net_amount가 null이므로 소비 시 cash_paid_amount로 폴백한다.
  net_amount: number | null;
  delivered_cans: number | null;
  snapshot_fresh_can_price: number | null;
}

/**
 * [14 J4] 알림 금액의 단일 진실. cash_paid_amount는 폐유 총액으로 동결돼 있어 상계 주문에서
 * 실지급액과 다르다(구매-only는 0, MIXED는 과다, net<0이면 부호까지 반대). 원장은 net 기준으로
 * 발행되므로(EARN(+net) / TRADE_PURCHASE(−|net|)) 통지도 net을 따라야 한다.
 * 레거시(net_amount null)는 cash_paid_amount로 폴백 — 20260724000008 v_dealer_rider_stats와 동일 패턴.
 */
function settledNet(order: TransitionOrder): number {
  return order.net_amount ?? order.cash_paid_amount ?? 0;
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
 * [14 J4] 완료 시점 정산 통지(CONFIRM_MEASURE·FORCE_COMPLETE 공통). net 부호로 방향이 갈린다:
 *   net > 0 : 라이더 → 점주 지급(기존 수거 흐름과 동일)
 *   net < 0 : 점주 → 라이더 지불(신유 대금이 폐유 수령액보다 큰 경우)
 *   net = 0 : 원장 무기록 — 금액 문구를 붙이면 오히려 오해를 부르므로 생략
 */
function settlementNotifications(order: TransitionOrder): NotificationSpec[] {
  const net = settledNet(order);
  const isPoint = order.payout_method === "POINT";

  if (net === 0) {
    return [
      {
        kind: "push",
        userIds: [order.rider_id, order.supplier_id],
        title: "거래 완료",
        body: "거래가 완료됐어요 — 폐유 금액과 새 기름 대금이 같아 주고받은 금액은 없어요.",
      },
    ];
  }

  if (net > 0) {
    const amount = isPoint ? formatPoint(net) : formatKrw(net);
    const specs: NotificationSpec[] = [
      {
        kind: "push",
        userIds: [order.rider_id],
        title: "수거 완료",
        body: `수거 완료 — ${isPoint ? "포인트" : "현금"} ${amount} 지급이 확인됐어요.`,
      },
    ];
    if (isPoint) {
      specs.push({
        kind: "push",
        userIds: [order.supplier_id],
        title: "포인트 적립",
        body: `포인트 ${amount}가 적립됐어요 — 지갑에서 출금 신청할 수 있어요.`,
        link: "/wallet",
      });
    }
    return specs;
  }

  // net < 0 — 점주가 새 기름 대금을 지불하는 방향.
  const owed = -net;
  const amount = isPoint ? formatPoint(owed) : formatKrw(owed);
  const specs: NotificationSpec[] = [
    {
      kind: "push",
      userIds: [order.rider_id],
      title: "거래 완료",
      body: `거래 완료 — 새 기름 대금 ${isPoint ? "포인트" : "현금"} ${amount} 수령이 확인됐어요.`,
    },
  ];
  if (isPoint) {
    specs.push({
      kind: "push",
      userIds: [order.supplier_id],
      title: "포인트 차감",
      body: `새 기름 대금으로 포인트 ${amount}가 차감됐어요.`,
      link: "/wallet",
    });
  }
  return specs;
}

/**
 * action×수신자×카피 매트릭스를 산출하는 순수 함수(부수효과 없음).
 * 금액은 주문 행에서 계산 — [14 J4] 정산 금액은 net_amount(상계 순액) 기준이며
 * cash_paid_amount(폐유 총액 동결)를 쓰지 않는다.
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
      // supplier 카피는 지급수단별 분기(08 §1-5) — [16 L5] confirm-remind(수동 재발송)와 문구를
      // 공유하도록 _shared/orderNotify.ts 순수 함수로 추출했다(카피 자체는 불변, 14 J4 순액 기준).
      const { title, body } = submitMeasureNotification(order);
      return [{ kind: "push", userIds: [order.supplier_id], title, body }];
    }

    case "CONFIRM_MEASURE":
      // 완료. 지급수단별 분기(08 §1-5). [14 J4] N = net_amount(상계 순액) — 원장 발행액과 동일.
      return settlementNotifications(order);

    case "FORCE_COMPLETE": {
      // supplier + rider: "관리자 확인으로 주문이 완료 처리됐어요". [14 J4] 정산 카피는 CONFIRM_MEASURE와
      // 동일 헬퍼를 쓴다 — 두 경로 모두 fn_settle_trade를 거쳐 같은 원장을 발행하므로 통지도 같아야 한다.
      return [
        {
          kind: "push",
          userIds: [order.supplier_id, order.rider_id],
          title: "주문 완료",
          body: "관리자 확인으로 주문이 완료 처리됐어요.",
        },
        ...settlementNotifications(order).filter((s) => s.kind === "push" && s.userIds.includes(order.supplier_id)),
      ];
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

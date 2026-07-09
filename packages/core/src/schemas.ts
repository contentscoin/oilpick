// zod 스키마 — docs/spec/02-api.md의 모든 Edge Function 입출력과 1:1 대응.
// Edge Function과 클라이언트가 동일 스키마로 검증한다(02-api.md 공통 규칙).

import { z } from "zod";

// ===== 공통 응답 envelope (02-api.md 공통 규칙) =====

/** 성공 응답: `{ ok: true, data }` */
export function okResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
  });
}

/** 실패 응답: `{ ok: false, code, message }` */
export const errorResponseSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
});

// ===== 공통 필드 =====

const uuidSchema = z.string().uuid();
/** requestedKg 1~500 (02-api.md order-create 검증). */
const requestedKgSchema = z.number().min(1).max(500);
/** kg은 소수 1자리(numeric(8,1), 01-db-schema.sql). */
const kgSchema = z.number().nonnegative();
const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

// ===== 1. order-create (supplier) =====

export const orderCreateInputSchema = z.object({
  requestedCans: z.number().int().positive().optional(),
  requestedKg: requestedKgSchema,
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema,
  preferredTime: z.string().min(1),
});
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;

// 07 F3b-①: estimatedPoint→estimatedCash 계약 개정, coupon_cost 스냅샷 추가,
// snapshotRiderFee 제거(레거시 — rider_fee 신규 미기록, 07 §1-3). 02-api.md "1. order-create" 출력.
export const orderCreateOutputSchema = z.object({
  orderId: uuidSchema,
  snapshotPricePerKg: z.number().int().positive(),
  couponCost: z.number().int().nonnegative(),
  estimatedCash: z.number().int().nonnegative(),
});
export type OrderCreateOutput = z.infer<typeof orderCreateOutputSchema>;

// ===== 2. order-accept (rider) =====

export const orderAcceptInputSchema = z.object({
  orderId: uuidSchema,
});
export type OrderAcceptInput = z.infer<typeof orderAcceptInputSchema>;

export const orderAcceptOutputSchema = z.object({
  orderId: uuidSchema,
  status: z.literal("ACCEPTED"),
  acceptedAt: z.string(),
});
export type OrderAcceptOutput = z.infer<typeof orderAcceptOutputSchema>;

// ===== 3. order-transition (rider/supplier/admin) =====

/** 02-api.md order-transition action별 payload 스키마. */
export const arrivePayloadSchema = z.undefined().or(z.object({}).strict());

export const submitMeasurePayloadSchema = z.object({
  measuredKg: kgSchema,
  photoUrls: z.array(z.string().url()).min(1),
});

export const confirmMeasurePayloadSchema = z.undefined().or(z.object({}).strict());

export const disputePayloadSchema = z.object({
  reason: z.string().min(1),
});

export const resolveDisputePayloadSchema = z.object({
  finalKg: kgSchema,
});

export const deliverPayloadSchema = z.object({
  depotId: uuidSchema,
  qrSecret: z.string().min(1),
});

/** 귀책(fault) — admin 취소 시 필수(D4·D6). 필수 강제는 RPC가 하지만 값 범위는 zod로도 검증. */
export const orderFaultSchema = z.enum(["SUPPLIER", "RIDER", "SYSTEM"]);
export type OrderFault = z.infer<typeof orderFaultSchema>;

export const cancelPayloadSchema = z.object({
  reason: z.string().min(1),
  // supplier 자진취소는 fault 불필요, admin 취소는 필수(RPC가 누락 시 VALIDATION_ERROR).
  fault: orderFaultSchema.optional(),
});

/** 07 F3b-③: FORCE_COMPLETE(admin, D6) — 교착 해소용. memo(사유) 필수. */
export const forceCompletePayloadSchema = z.object({
  memo: z.string().min(1),
});

/** action 판별로 payload 타입을 좁히는 discriminated union. */
export const orderTransitionInputSchema = z.discriminatedUnion("action", [
  z.object({ orderId: uuidSchema, action: z.literal("ARRIVE"), payload: arrivePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("SUBMIT_MEASURE"), payload: submitMeasurePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("CONFIRM_MEASURE"), payload: confirmMeasurePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("DISPUTE"), payload: disputePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("RESOLVE_DISPUTE"), payload: resolveDisputePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("FORCE_COMPLETE"), payload: forceCompletePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("DELIVER"), payload: deliverPayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("CANCEL"), payload: cancelPayloadSchema }),
]);
export type OrderTransitionInput = z.infer<typeof orderTransitionInputSchema>;

export const orderTransitionOutputSchema = z.object({
  orderId: uuidSchema,
  status: z.enum([
    "REQUESTED",
    "ACCEPTED",
    "ARRIVED",
    "PICKED_UP",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
    "DISPUTED",
  ]),
});
export type OrderTransitionOutput = z.infer<typeof orderTransitionOutputSchema>;

// ===== 4. order-expire (cron, 입력 없음) =====

export const orderExpireOutputSchema = z.object({
  rebroadcasted: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});
export type OrderExpireOutput = z.infer<typeof orderExpireOutputSchema>;

// ===== 5. rider-location (rider) =====

export const riderLocationInputSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
});
export type RiderLocationInput = z.infer<typeof riderLocationInputSchema>;

export const riderLocationOutputSchema = z.object({
  updatedAt: z.string(),
});
export type RiderLocationOutput = z.infer<typeof riderLocationOutputSchema>;

// ===== 6. rider-verify (admin) =====
// 07 F11-①: SUSPENDED(정지)/REINSTATED(해제) 액션 추가. APPROVED=최초 승인(서류·인계처 서버 검증),
// REJECTED=반려, SUSPENDED=정지(사유 필수, is_online 강제 false), REINSTATED=정지 해제(APPROVED 복귀,
// 서류 재검증 없음). REJECTED/SUSPENDED는 rejectReason(사유)을 재사용해 담는다(별도 컬럼 신설 없이
// rider_profiles.reject_reason에 저장 — 기존 스키마 관례).
export const riderVerifyInputSchema = z.object({
  riderId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "REINSTATED"]),
  rejectReason: z.string().min(1).optional(),
});
export type RiderVerifyInput = z.infer<typeof riderVerifyInputSchema>;

export const riderVerifyOutputSchema = z.object({
  riderId: uuidSchema,
  verifyStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
});
export type RiderVerifyOutput = z.infer<typeof riderVerifyOutputSchema>;

// ===== 7. withdraw-request (supplier/rider) =====

export const withdrawRequestInputSchema = z.object({
  amount: z.number().int().min(10000),
});
export type WithdrawRequestInput = z.infer<typeof withdrawRequestInputSchema>;

export const withdrawRequestOutputSchema = z.object({
  withdrawalId: uuidSchema,
  status: z.literal("REQUESTED"),
  amount: z.number().int(),
});
export type WithdrawRequestOutput = z.infer<typeof withdrawRequestOutputSchema>;

// ===== 8. withdraw-process (admin) =====

export const withdrawProcessInputSchema = z.object({
  withdrawalId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED", "PAID"]),
  memo: z.string().optional(),
});
export type WithdrawProcessInput = z.infer<typeof withdrawProcessInputSchema>;

export const withdrawProcessOutputSchema = z.object({
  withdrawalId: uuidSchema,
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "PAID"]),
});
export type WithdrawProcessOutput = z.infer<typeof withdrawProcessOutputSchema>;

// ===== 9. price-set (admin) =====

// 07 F3b-④: riderFee 계약 삭제(레거시 — rider_fee 신규 미기록, 07 §1-3). 02-api.md "9. price-set".
export const priceSetInputSchema = z.object({
  pricePerKg: z.number().int().positive(),
});
export type PriceSetInput = z.infer<typeof priceSetInputSchema>;

export const priceSetOutputSchema = z.object({
  id: z.number().int(),
  pricePerKg: z.number().int().positive(),
  effectiveAt: z.string(),
});
export type PriceSetOutput = z.infer<typeof priceSetOutputSchema>;

// ===== 10. point-adjust (admin) =====

export const pointAdjustInputSchema = z.object({
  userId: uuidSchema,
  amount: z.number().int(),
  memo: z.string().min(1),
});
export type PointAdjustInput = z.infer<typeof pointAdjustInputSchema>;

export const pointAdjustOutputSchema = z.object({
  userId: uuidSchema,
  amount: z.number().int(),
});
export type PointAdjustOutput = z.infer<typeof pointAdjustOutputSchema>;

// ===== 14. coupon-adjust (admin) — 07 F3b-⑤ =====
// 쿠폰 수동 조정(CS 보조/데모 라이더 선지급). point-adjust 패턴 미러 → fn_charge_coupon(ADJUST).
// qty는 ±(0 불가). 음수 조정이 잔액을 초과하면 RPC가 INSUFFICIENT_COUPON(409)을 raise한다.

export const couponAdjustInputSchema = z.object({
  riderId: uuidSchema,
  qty: z.number().int().refine((v) => v !== 0, { message: "조정 수량은 0이 될 수 없어요." }),
  memo: z.string().min(1),
});
export type CouponAdjustInput = z.infer<typeof couponAdjustInputSchema>;

export const couponAdjustOutputSchema = z.object({
  riderId: uuidSchema,
  qty: z.number().int(),
});
export type CouponAdjustOutput = z.infer<typeof couponAdjustOutputSchema>;

// ===== 15. coupon-price-set (admin) — 07 F3b-⑤ =====
// 쿠폰 단가 tick 등록(price-set 패턴 미러 → coupon_price_ticks insert). unitPrice > 0.

export const couponPriceSetInputSchema = z.object({
  unitPrice: z.number().int().positive(),
});
export type CouponPriceSetInput = z.infer<typeof couponPriceSetInputSchema>;

export const couponPriceSetOutputSchema = z.object({
  id: z.number().int(),
  unitPrice: z.number().int().positive(),
  effectiveAt: z.string(),
});
export type CouponPriceSetOutput = z.infer<typeof couponPriceSetOutputSchema>;

// ===== 11. coupon-purchase-intent (rider) — 07 F4 =====
// 쿠폰 구매 신청(PG 결제위젯 진입 전). qty 1~200 → 최신 coupon_price_ticks 스냅샷 →
// coupon_purchases(PENDING) 생성. 단가 미설정 시 409 COUPON_PRICE_NOT_SET.

export const couponPurchaseIntentInputSchema = z.object({
  qty: z.number().int().min(1).max(200),
});
export type CouponPurchaseIntentInput = z.infer<typeof couponPurchaseIntentInputSchema>;

export const couponPurchaseIntentOutputSchema = z.object({
  purchaseId: uuidSchema,
  /** PG 주문번호(pg_order_id). 토스 requestPayment()의 orderId / 코엠 orderno(20자 이내). */
  pgOrderId: z.string().min(1),
  /** 결제 금액(원) = qty × unitPrice. 위젯 setAmount·confirm amount 검증 기준. */
  amount: z.number().int().positive(),
  unitPrice: z.number().int().positive(),
  /** 코엠(PG_PROVIDER=koem) 결제창 진입 정보(07 F14). 클라이언트는 params를 수정 없이
      hidden form으로 payUrl에 POST한다(checkHash 포함 — 서버 생성). 토스 모드에서는 없음. */
  koem: z
    .object({
      payUrl: z.string().min(1),
      params: z.record(z.string()),
    })
    .optional(),
  /** 데모 결제(PG_PROVIDER=demo, 07 F14 데모 운영 — 코엠 실연결 전). 클라이언트는 결제창 없이
      곧장 confirm(paymentKey=`demo_${purchaseId}`)을 호출한다. 실 PG 모드에서는 없음. */
  demo: z.literal(true).optional(),
});
export type CouponPurchaseIntentOutput = z.infer<typeof couponPurchaseIntentOutputSchema>;

// ===== 12. coupon-purchase-confirm (rider) — 07 F4 =====
// 토스 successUrl 파라미터를 그대로 받아 승인 확정 + 쿠폰 충전(멱등 3중, 07 §1-4).
// 출력은 충전 후 잔액 {balance}. 재호출 안전(orphan 재시도).

export const couponPurchaseConfirmInputSchema = z.object({
  purchaseId: uuidSchema,
  paymentKey: z.string().min(1),
  pgOrderId: z.string().min(1),
  amount: z.number().int().positive(),
});
export type CouponPurchaseConfirmInput = z.infer<typeof couponPurchaseConfirmInputSchema>;

export const couponPurchaseConfirmOutputSchema = z.object({
  /** 충전 후 쿠폰 잔액(장). v_coupon_balance 재조회. */
  balance: z.number().int().nonnegative(),
});
export type CouponPurchaseConfirmOutput = z.infer<typeof couponPurchaseConfirmOutputSchema>;

// ===== 13. coupon-refund (admin) — 07 F4 =====
// 쿠폰 구매 건 환불(구매 건 단위, 건당 1회). qty 생략=전액, 지정=부분 1회. reason 필수.
// 미사용 잔액 부족 시 409 INSUFFICIENT_COUPON, 토스 취소 실패 시 402 PAYMENT_FAILED.

export const couponRefundInputSchema = z.object({
  purchaseId: uuidSchema,
  /** 환불 수량(장). 생략 시 구매 전액. 1 이상, 구매 qty 이하(RPC가 상한 검증). */
  qty: z.number().int().positive().optional(),
  reason: z.string().min(1),
});
export type CouponRefundInput = z.infer<typeof couponRefundInputSchema>;

export const couponRefundOutputSchema = z.object({
  purchaseId: uuidSchema,
  /** 실제 환불된 수량(장). */
  refundedQty: z.number().int().positive(),
  /** 환불 후 라이더 쿠폰 잔액(장). */
  balance: z.number().int().nonnegative(),
});
export type CouponRefundOutput = z.infer<typeof couponRefundOutputSchema>;

// ===== U2 supplier 가입 (profiles + supplier_profiles row 생성) =====
// 이 입력은 Edge Function이 아니라 클라이언트가 anon key로 profiles/supplier_profiles에
// 직접 insert할 때 쓰인다(01-db-schema.sql RLS p_profiles_insert/p_sup_self가 본인 행
// insert를 허용). CLAUDE.md 규칙 4 "모든 API 입출력은 zod 스키마로 검증"에 따라 Edge
// Function 여부와 무관하게 zod로 검증한다.

export const supplierSignupInputSchema = z.object({
  displayName: z.string().min(1),
  storeName: z.string().min(1),
  bizNumber: z.string().min(1),
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema,
});
export type SupplierSignupInput = z.infer<typeof supplierSignupInputSchema>;

// 06-enhancement-plan.md E4 — 가입 후 매장정보 수정(/my/edit). 사업자등록번호(bizNumber)는
// 정책상 변경 불가라 제외한다. 가입과 동일하게 클라이언트가 anon key로 본인 profiles/
// supplier_profiles를 update(RLS p_profiles_update/p_sup_self)하며, role/phone은 수정 대상이 아니다.
export const supplierProfileUpdateSchema = z.object({
  displayName: z.string().min(1),
  storeName: z.string().min(1),
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema,
});
export type SupplierProfileUpdateInput = z.infer<typeof supplierProfileUpdateSchema>;

// ===== notify-broadcast (admin) =====
// 03-frontend.md apps/admin "/notify": "전체/역할별 푸시 발송 폼". 02-api.md에는 없던
// 신규 엔드포인트 — T11 작업 지시사항이 명시한 "notifications 테이블 insert는 되고 실제
// 발송은 로그만"이라는 기존 가정(04-tasks.md 질문 목록 "FCM 서비스 계정 자격증명 없음")을
// 그대로 재사용하는 얇은 래퍼다. _shared/push.ts의 sendPush(userIds, title, body, link)를
// 대상 role별 user id 목록에 호출하기만 하고 새 발송 로직을 만들지 않는다.

export const notifyBroadcastInputSchema = z.object({
  target: z.enum(["ALL", "supplier", "rider"]),
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().optional(),
});
export type NotifyBroadcastInput = z.infer<typeof notifyBroadcastInputSchema>;

export const notifyBroadcastOutputSchema = z.object({
  recipientCount: z.number().int().nonnegative(),
});
export type NotifyBroadcastOutput = z.infer<typeof notifyBroadcastOutputSchema>;

// ===== CS 문의 티켓 (admin/user/rider) — 07 F12 =====
// cs_tickets(01-db-schema.sql [07 F12], 20260709000007_cs_tickets.sql)와 1:1.
// CASH_DISPUTE = 현금 지급 후 분쟁 전용(07 §1-3), COUPON_PAYMENT = 쿠폰 결제/환불 문의.

export const csCategorySchema = z.enum(["ORDER", "CASH_DISPUTE", "COUPON_PAYMENT", "ACCOUNT", "ETC"]);
export type CsCategory = z.infer<typeof csCategorySchema>;

export const csStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);
export type CsStatus = z.infer<typeof csStatusSchema>;

/**
 * 문의 접수 폼 입력(user/rider). author_id·role은 클라이언트가 세션/프로필에서 채워
 * cs_tickets에 직접 insert하고(RLS가 위조 차단), 이 스키마는 폼 필드만 검증한다.
 * orderId는 선택(주문 연결). CLAUDE.md 규칙 4 "모든 API 입출력은 zod 스키마로 검증".
 */
export const csTicketInputSchema = z.object({
  category: csCategorySchema,
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
  orderId: uuidSchema.optional(),
});
export type CsTicketInput = z.infer<typeof csTicketInputSchema>;

/**
 * admin 답변(cs-reply Edge Function 입력). admin_reply + 상태 전이(IN_PROGRESS/RESOLVED)를
 * 원자 처리하고 작성자에게 알림을 보낸다. RESOLVED 시 resolved_at 기록(서버).
 */
export const csReplyInputSchema = z.object({
  ticketId: uuidSchema,
  reply: z.string().min(1).max(2000),
  status: z.enum(["IN_PROGRESS", "RESOLVED"]),
});
export type CsReplyInput = z.infer<typeof csReplyInputSchema>;

export const csReplyOutputSchema = z.object({
  ticketId: uuidSchema,
  status: csStatusSchema,
});
export type CsReplyOutput = z.infer<typeof csReplyOutputSchema>;

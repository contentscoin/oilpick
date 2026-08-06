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
/** kg은 소수 1자리(numeric(8,1), 01-db-schema.sql). */
const kgSchema = z.number().nonnegative();
const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

// ===== 1. order-create (supplier) =====

export const orderCreateInputSchema = z
  .object({
    requestedCans: z.number().int().positive().optional(),
    // [14 J2] 구매-only 주문은 폐유 0 → requestedKg 0 허용(폐유 성분 상한 500kg은 유지).
    requestedKg: z.number().min(0).max(500),
    // [14 J2] 신유 구매 통수(18L 1종 단일 SKU, 1..50). 있으면 order_kind=PURCHASE/MIXED.
    purchaseCans: z.number().int().min(1).max(50).optional(),
    address: z.string().min(1),
    lat: latSchema,
    lng: lngSchema,
    preferredTime: z.string().min(1),
  })
  // 폐유 수거(requestedKg≥1)와 신유 구매(purchaseCans≥1) 중 최소 하나는 있어야 한다("둘 다 0" 차단).
  .refine((v) => v.requestedKg >= 1 || (v.purchaseCans ?? 0) >= 1, {
    message: "폐유 수거 또는 신유 구매 중 하나는 선택해야 해요.",
  });
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;

// 08 G3-①: couponCost 필드 삭제(쿠폰 모델 폐기 — coupon_cost 스냅샷 중지, 08 P1).
// 07 F3b-①의 estimatedCash 계약·snapshotRiderFee 제거는 유지. 02-api.md "1. order-create" 출력.
export const orderCreateOutputSchema = z.object({
  orderId: uuidSchema,
  snapshotPricePerKg: z.number().int().positive(),
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

/**
 * 현장 지급수단(08 P2). 라이더가 SUBMIT_MEASURE에서 선택 — CASH=현금 직접 지급,
 * POINT=점주 확인 시 point_ledger EARN 적립(1P=1원). pickup_orders.payout_method와 1:1.
 */
export const payoutMethodSchema = z.enum(["CASH", "POINT"]);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

/**
 * [14 §4] 바코드+GPS 현장 수거이력. 수거 시 촬영/스캔한 폐식용유 바코드와 촬영 시점 디바이스 GPS.
 * 지급/정산과 무관 — 캡처 전용. RPC가 order_events.payload 보존 + pickup_items 1급 적재(J1).
 */
export const pickupGeoSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  capturedAt: z.string().optional(), // ISO8601 촬영 시각(디바이스). 서버 now()와 별개 기록.
});
export type PickupGeo = z.infer<typeof pickupGeoSchema>;

/**
 * [O2 2026-08-05, 14 §2 확장] 바코드 1건 — 코드 + 선택 사진(order-photos 서명 URL, 첨부 즉시 업로드).
 * 사진 단독 등록은 클라이언트가 `photo-` + 고유 접미(예: Date.now().toString(36)) 코드를 생성해
 * code로 보낸다(unique(order_id, barcode) 충족 — 목록에는 "사진 등록"으로 표시).
 */
export const barcodeItemSchema = z.object({
  code: z.string().min(1),
  photoUrl: z.string().url().optional(),
});
export type BarcodeItem = z.infer<typeof barcodeItemSchema>;

// 08 P2: payoutMethod 필수(신 클라이언트 강제). RPC는 생략 시 CASH 폴백으로 구버전 번들과 호환.
// [14 §4] barcodes·geo는 선택(구버전 번들·재제출 호환). 있으면 order_events.payload + pickup_items에 보존.
// [O2] barcodeItems가 있으면 RPC가 그것으로 적재(photo_url 포함, barcodes보다 우선) — barcodes는 구버전 폴백.
export const submitMeasurePayloadSchema = z.object({
  measuredKg: kgSchema,
  photoUrls: z.array(z.string().url()).min(1),
  payoutMethod: payoutMethodSchema,
  barcodes: z.array(z.string().min(1)).max(50).optional(),
  barcodeItems: z.array(barcodeItemSchema).max(50).optional(),
  geo: pickupGeoSchema.optional(),
  // [14 J2] 현장 실배달 신유 통수(구매 동반 주문 필수 0..50 — 필수 강제는 RPC가 order_kind로 판정).
  deliveredCans: z.number().int().min(0).max(50).optional(),
});

export const confirmMeasurePayloadSchema = z.undefined().or(z.object({}).strict());

export const disputePayloadSchema = z.object({
  reason: z.string().min(1),
});

export const resolveDisputePayloadSchema = z.object({
  finalKg: kgSchema,
  /**
   * [14 J4] 구매 동반 주문의 배달 통수 중재 정정(14 §3·§8). 선택 — 없으면 delivered_cans 유지.
   * 중재 후에는 SUBMIT_MEASURE가 막히므로(final_kg 가드) 여기서만 정정할 수 있다.
   */
  finalCans: z.number().int().min(0).max(50).optional(),
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

// ===== [16 L5] confirm-remind (rider) — 점주 수령확인 수동 재요청 =====

export const confirmRemindInputSchema = z.object({
  orderId: uuidSchema,
});
export type ConfirmRemindInput = z.infer<typeof confirmRemindInputSchema>;

/** sent=false는 rate limit(주문당 2시간 1회)에 걸려 발송을 스킵했다는 뜻 — 에러가 아니다. */
export const confirmRemindOutputSchema = z.object({
  sent: z.boolean(),
});
export type ConfirmRemindOutput = z.infer<typeof confirmRemindOutputSchema>;

// ===== [N3, 08 P2 확장] payout-change-request (supplier) — 현금 지급 변경 요청 =====

export const payoutChangeRequestInputSchema = z.object({
  orderId: uuidSchema,
});
export type PayoutChangeRequestInput = z.infer<typeof payoutChangeRequestInputSchema>;

/** sent=false는 rate limit(주문당 2시간 1회) 스킵 — 에러가 아니다(confirm-remind와 동일 규약). */
export const payoutChangeRequestOutputSchema = z.object({
  sent: z.boolean(),
});
export type PayoutChangeRequestOutput = z.infer<typeof payoutChangeRequestOutputSchema>;

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
  // [08 Q1] 신청 시점 수수료 스냅샷(현행 1,000P). 별도 원장 행 WITHDRAW_FEE로 함께 차감된다.
  fee: z.number().int(),
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

/** [14 J2] pickup_orders.order_kind. null=레거시=PICKUP. 수거만/구매만/수거+구매. */
export const orderKindSchema = z.enum(["PICKUP", "PURCHASE", "MIXED"]);
export type OrderKind = z.infer<typeof orderKindSchema>;

// ===== 9-b. price-set kind=FRESH (신유 고시가, 14 J2) =====
// price-set Edge가 body.kind로 분기 — 'FRESH'면 아래 스키마로 검증해 fresh_oil_price_ticks에 insert.
// 단일 SKU(18L 1종) — price_per_can = 18L 1통 판매가(원). price_ticks 패턴과 동일(정정불가·신규 tick만).
export const freshOilPriceSetInputSchema = z.object({
  pricePerCan: z.number().int().positive(),
});
export type FreshOilPriceSetInput = z.infer<typeof freshOilPriceSetInputSchema>;

export const freshOilPriceSetOutputSchema = z.object({
  id: z.number().int(),
  pricePerCan: z.number().int().positive(),
  effectiveAt: z.string(),
});
export type FreshOilPriceSetOutput = z.infer<typeof freshOilPriceSetOutputSchema>;

/** fresh_oil_price_ticks 최신 tick 조회 모델(useFreshOilPrice). 없으면 신유 구매 UI를 숨긴다. */
export const freshOilPriceTickSchema = z.object({
  id: z.number().int(),
  pricePerCan: z.number().int().positive(),
  effectiveAt: z.string(),
});
export type FreshOilPriceTick = z.infer<typeof freshOilPriceTickSchema>;

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

// ===== 11~15. coupon-* — [17 Q2] 복권(08 P1이 삭제했던 계약을 a4b4fdd^에서 재복원) =====
// 수거쿠폰 복권(17-coupon-revival.md C1~C4). DB 테이블·RPC는 08에서도 보존돼 있었으므로
// zod 계약·Edge Function만 복원하면 된다. 기본 PG는 코엠페이먼츠 SIMPLEPAY(17 C3).

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

// ===== 11. coupon-purchase-intent (rider) — 07 F4·F14 =====
// 쿠폰 구매 신청(PG 결제 진입 전). qty 1~200 → 최신 coupon_price_ticks 스냅샷 →
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
  /** 코엠(PG_PROVIDER=koem — 기본, 17 C3) 결제창 진입 정보(07 F14). 클라이언트는 params를 수정
      없이 hidden form으로 payUrl에 POST한다(checkHash 포함 — 서버 생성). 토스 모드에서는 없음. */
  koem: z
    .object({
      payUrl: z.string().min(1),
      params: z.record(z.string()),
    })
    .optional(),
  /** 데모 결제(PG_PROVIDER=demo, 07 F14 데모 운영 — 개발·데모 전용, 프로덕션 금지). 클라이언트는
      결제창 없이 곧장 confirm(paymentKey=`demo_${purchaseId}`)을 호출한다. 실 PG 모드에서는 없음. */
  demo: z.literal(true).optional(),
});
export type CouponPurchaseIntentOutput = z.infer<typeof couponPurchaseIntentOutputSchema>;

// ===== 12. coupon-purchase-confirm (rider) — 07 F4 (토스·데모 전용) =====
// 토스 successUrl 파라미터를 그대로 받아 승인 확정 + 쿠폰 충전(멱등 3중, 07 §1-4).
// 출력은 충전 후 잔액 {balance}. 재호출 안전(orphan 재시도). 코엠 확정은 return 콜백(12-1)이 담당.

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
// 미사용 잔액 부족 시 409 INSUFFICIENT_COUPON, PG 취소 실패 시 402 PAYMENT_FAILED.

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

// ===== 라이더 추천(레퍼럴) — 09 H2/H3 (referrals·rider_profiles.referral_code와 1:1) =====

/** referrals.status(01-db-schema.sql referral_status). */
export const referralStatusSchema = z.enum(["SIGNED_UP", "ACTIVATED", "CANCELLED"]);
export type ReferralStatus = z.infer<typeof referralStatusSchema>;

/**
 * 추천코드 형식: Crockford base32(혼동문자 I·L·O·U 제외) 대문자 8자. trim·대문자 정규화 후 검증.
 * 라이더 공유 코드 발급(referral-code 출력)과 점주 attach 입력(referral-attach)이 공유한다.
 */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, "추천코드 형식이 올바르지 않아요.");

/** referral-code (rider): 입력 없음(세션 라이더 본인). 코드가 없으면 서버가 생성해 반환. */
export const referralCodeOutputSchema = z.object({
  code: referralCodeSchema,
  shareUrl: z.string().url(),
});
export type ReferralCodeOutput = z.infer<typeof referralCodeOutputSchema>;

/** referral-attach (supplier): 가입 직후 저장해둔 코드로 추천 연결(best-effort, 비차단). */
export const referralAttachInputSchema = z.object({
  code: referralCodeSchema,
});
export type ReferralAttachInput = z.infer<typeof referralAttachInputSchema>;

export const referralAttachOutputSchema = z.object({
  status: referralStatusSchema,
  supplierBonus: z.number().int().nonnegative(),
});
export type ReferralAttachOutput = z.infer<typeof referralAttachOutputSchema>;

/** v_referral_stats 행(라이더 실적 — 본인 1행, admin 전체). 앱/관리자 공유 조회 스키마. */
export const referralStatsSchema = z.object({
  referrer_rider_id: uuidSchema,
  signed_up: z.number().int().nonnegative(),
  activated: z.number().int().nonnegative(),
  supplier_bonus_paid: z.number().int().nonnegative(),
  rider_reward_earned: z.number().int().nonnegative(),
  // [09 H8] 보상 정산 분리 합계(20260716000001에서 뷰에 append).
  rider_reward_settled: z.number().int().nonnegative(),
  rider_reward_unsettled: z.number().int().nonnegative(),
});
export type ReferralStats = z.infer<typeof referralStatsSchema>;

/** referral-settle (admin): 보상 정산 마킹/해제 — 09 H8. settle=false는 오기록 정정(해제). */
export const referralSettleInputSchema = z.object({
  referralId: uuidSchema,
  settle: z.boolean(),
});
export type ReferralSettleInput = z.infer<typeof referralSettleInputSchema>;

export const referralSettleOutputSchema = z.object({
  referralId: uuidSchema,
  settled: z.boolean(),
  settledAt: z.string().nullable(),
});
export type ReferralSettleOutput = z.infer<typeof referralSettleOutputSchema>;

/**
 * directions (M9-b, 11-map-renderer.md): 출발→도착 도로 경로. 카카오모빌리티 Directions API를
 * Edge Function이 프록시한다(REST 키는 서버 시크릿 KAKAO_MOBILITY_KEY — CLAUDE.md 규칙 3).
 * 키 미설정 시 출력의 configured=false로 기능이 조용히 비활성(라이더 위치만 표시).
 */
/**
 * [12 S2 재설계] 주소 → 좌표 지오코딩. **서버측 프록시 전용**.
 * 브라우저에서 VWorld API를 직접 부르면 (1) CORS로 차단되고 (2) 인증키가 번들에 노출된다
 * (절대 규칙 3). geocode Edge Function이 키를 들고 대신 호출한다.
 */
export const geocodeInputSchema = z.object({
  address: z.string().trim().min(1).max(200),
});
export type GeocodeInput = z.infer<typeof geocodeInputSchema>;

export const geocodeOutputSchema = z.object({
  /** 서버에 VWORLD_KEY가 설정돼 지오코딩이 가능한지. false면 point는 null. */
  configured: z.boolean(),
  /** 변환된 좌표. 주소를 못 찾았거나 미구성이면 null → 호출부는 수동 좌표 입력으로 강등. */
  point: z.object({ lat: latSchema, lng: lngSchema }).nullable(),
});
export type GeocodeOutput = z.infer<typeof geocodeOutputSchema>;

export const directionsInputSchema = z.object({
  origin: z.object({ lat: latSchema, lng: lngSchema }),
  destination: z.object({ lat: latSchema, lng: lngSchema }),
});
export type DirectionsInput = z.infer<typeof directionsInputSchema>;

export const directionsOutputSchema = z.object({
  /** 서버에 KAKAO_MOBILITY_KEY가 설정돼 라우팅이 가능한지. false면 path는 빈 배열. */
  configured: z.boolean(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  /** 경로 폴리라인(출발→도착). MapView가 선으로 그린다. 미구성/실패 시 빈 배열. */
  path: z.array(z.object({ lat: latSchema, lng: lngSchema })),
});
export type DirectionsOutput = z.infer<typeof directionsOutputSchema>;

/** dealer-create (admin, 13 I2): 좌상 계정 생성. 아이디→<아이디>@oilpick.local(admin 로그인과 동일 매핑). */
export const dealerCreateInputSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/, "아이디는 영소문자·숫자·밑줄만 가능해요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 해요."),
  displayName: z.string().min(1).max(40),
  phone: z.string().min(1).max(20),
  /**
   * [18 R8] 초기 사용한도(P). 지정하면 dealer_accounts 행을 함께 생성한다. 생략하면 계정 행이
   * 없어 크레딧 게이트가 미적용(무제한)이므로 admin 목록에 "한도 미설정" 경고가 뜬다(14 §10 #2).
   */
  creditLimit: z.number().int().min(0).optional(),
});
export type DealerCreateInput = z.infer<typeof dealerCreateInputSchema>;

export const dealerCreateOutputSchema = z.object({
  dealerId: uuidSchema,
  username: z.string(),
});
export type DealerCreateOutput = z.infer<typeof dealerCreateOutputSchema>;

/**
 * dealer-update (admin, 13 I2 보강 — CEO 2026-08-06 "좌상 정보수정"): 좌상 아이디/비밀번호/상호/연락처 수정.
 * 아이디 변경은 GoTrue email(<아이디>@oilpick.local) 재매핑, 비밀번호는 관리자 재설정(현재 비밀번호 불요).
 * 넷 중 최소 하나는 있어야 한다.
 */
export const dealerUpdateInputSchema = z
  .object({
    dealerId: uuidSchema,
    username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/, "아이디는 영소문자·숫자·밑줄만 가능해요.").optional(),
    password: z.string().min(8, "비밀번호는 8자 이상이어야 해요.").optional(),
    displayName: z.string().min(1).max(40).optional(),
    phone: z.string().min(1).max(20).optional(),
  })
  .refine((v) => v.username != null || v.password != null || v.displayName != null || v.phone != null, {
    message: "수정할 항목을 하나 이상 입력해주세요.",
  });
export type DealerUpdateInput = z.infer<typeof dealerUpdateInputSchema>;

export const dealerUpdateOutputSchema = z.object({
  dealerId: uuidSchema,
  /** 수정 후 로그인 아이디(변경 없으면 기존 값). */
  username: z.string(),
});
export type DealerUpdateOutput = z.infer<typeof dealerUpdateOutputSchema>;

/** dealer-assign (admin + 좌상 자기소속, 13 I2): rider_profiles.dealer_id 배정/해제. dealerId=null은 해제. */
export const dealerAssignInputSchema = z.object({
  riderId: uuidSchema,
  dealerId: uuidSchema.nullable(),
});
export type DealerAssignInput = z.infer<typeof dealerAssignInputSchema>;

export const dealerAssignOutputSchema = z.object({
  riderId: uuidSchema,
  dealerId: uuidSchema.nullable(),
});
export type DealerAssignOutput = z.infer<typeof dealerAssignOutputSchema>;

/** v_dealer_rider_stats 행(좌상 실적 통계, 13 I4). 금액은 표시용 — 정산 로직 없음(D5). */
export const dealerRiderStatsSchema = z.object({
  rider_id: uuidSchema,
  dealer_id: uuidSchema.nullable(),
  rider_name: z.string().nullable(),
  verify_status: z.string(),
  is_online: z.boolean(),
  completed_count: z.number().int().nonnegative(),
  collected_kg: z.number().nonnegative(),
  cash_paid: z.number().int().nonnegative(),
  point_paid: z.number().int().nonnegative(),
  referral_signed_up: z.number().int().nonnegative(),
  referral_activated: z.number().int().nonnegative(),
  /** [17 Q5] 완료 주문 coupon_cost 합(뷰 append, null→0). 조회 전용 — 정산 무관(17 C5). */
  coupon_used_qty: z.number().int().nonnegative(),
});
export type DealerRiderStats = z.infer<typeof dealerRiderStatsSchema>;

// ===== 좌상 정산 체인 (14 J3) =====

/** dealer-account-set (admin): 좌상 보증금·한도·임계·요율 upsert. 금액은 정수(원/P). */
/** [18 R1] 좌상 크레딧 배분 모드. POOL=총량 공유(선착순, 기존 동작) / PER_RIDER=라이더별 배분. */
export const dealerAllocModeSchema = z.enum(["POOL", "PER_RIDER"]);
export type DealerAllocMode = z.infer<typeof dealerAllocModeSchema>;

export const dealerAccountSetInputSchema = z.object({
  dealerId: uuidSchema,
  depositAmount: z.number().int().min(0),
  creditLimit: z.number().int().min(0),
  claimThreshold: z.number().int().positive(),
  feeRateBp: z.number().int().min(0).max(10000), // 요율(bp, 1bp=0.01%). 초기 0
  /** [18 R1] 생략 시 기존 값 유지(신규 행은 POOL). */
  allocationMode: dealerAllocModeSchema.optional(),
});
export type DealerAccountSetInput = z.infer<typeof dealerAccountSetInputSchema>;

export const dealerAccountSchema = z.object({
  dealer_id: uuidSchema,
  deposit_amount: z.number().int(),
  credit_limit: z.number().int(),
  claim_threshold: z.number().int(),
  fee_rate_bp: z.number().int(),
  allocation_mode: dealerAllocModeSchema.default("POOL"),
});
export type DealerAccount = z.infer<typeof dealerAccountSchema>;

/**
 * [18 R2·R9] dealer-rider-limit-set — 라이더 개인 한도 배분(admin + 소속 좌상).
 * creditLimit=null은 배분 해제(PER_RIDER 모드에서 0으로 취급 = 지급 불가).
 */
export const dealerRiderLimitSetInputSchema = z.object({
  riderId: uuidSchema,
  creditLimit: z.number().int().min(0).nullable(),
});
export type DealerRiderLimitSetInput = z.infer<typeof dealerRiderLimitSetInputSchema>;

export const dealerRiderLimitSetOutputSchema = z.object({
  riderId: uuidSchema,
  creditLimit: z.number().int().nullable(),
});
export type DealerRiderLimitSetOutput = z.infer<typeof dealerRiderLimitSetOutputSchema>;

/** [18 R6] v_rider_credit — 라이더 게이지바 소스(본인·소속 좌상·admin 조회). */
export const riderCreditSchema = z.object({
  rider_id: uuidSchema,
  dealer_id: uuidSchema.nullable(),
  allocation_mode: dealerAllocModeSchema.nullable(),
  limit_amount: z.number().int().nullable(),
  used: z.number().int(),
  available: z.number().int(),
  is_unlimited: z.boolean(),
});
export type RiderCredit = z.infer<typeof riderCreditSchema>;

/** dealer-claim (admin): 좌상 정산 청구 생성/정산/무효. create=dealerId, settle/void=settlementId. */
export const dealerClaimInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), dealerId: uuidSchema }),
  z.object({ action: z.literal("settle"), settlementId: uuidSchema }),
  z.object({ action: z.literal("void"), settlementId: uuidSchema }),
]);
export type DealerClaimInput = z.infer<typeof dealerClaimInputSchema>;

export const dealerSettlementStatusSchema = z.enum(["CLAIMED", "SETTLED", "VOID"]);
export type DealerSettlementStatus = z.infer<typeof dealerSettlementStatusSchema>;

/** dealer_settlements 행(청구 이력). net_due 음수=회사→좌상 지급. */
export const dealerSettlementSchema = z.object({
  id: uuidSchema,
  dealer_id: uuidSchema,
  status: dealerSettlementStatusSchema,
  point_minted: z.number().int(),
  point_spent: z.number().int(),
  fee_amount: z.number().int(),
  net_due: z.number().int(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  claimed_at: z.string(),
  settled_at: z.string().nullable(),
  voided_at: z.string().nullable(),
});
export type DealerSettlement = z.infer<typeof dealerSettlementSchema>;

/** v_dealer_statement 행(좌상 명세 — 사용액/한도/여유/임계초과). */
export const dealerStatementSchema = z.object({
  dealer_id: uuidSchema,
  deposit_amount: z.number().int(),
  credit_limit: z.number().int(),
  claim_threshold: z.number().int(),
  fee_rate_bp: z.number().int(),
  point_minted: z.number().int(),
  point_spent: z.number().int(),
  usage: z.number().int(),
  headroom: z.number().int(),
  over_threshold: z.boolean(),
  unsettled_order_count: z.number().int().nonnegative(),
  unsettled_gross: z.number().int(),
});
export type DealerStatement = z.infer<typeof dealerStatementSchema>;

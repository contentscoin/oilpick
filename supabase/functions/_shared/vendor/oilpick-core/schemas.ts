// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/schemas.ts.
// packages/core/src/schemas.ts
import { z } from "zod";
function okResponseSchema(dataSchema) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema
  });
}
var errorResponseSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string()
});
var uuidSchema = z.string().uuid();
var kgSchema = z.number().nonnegative();
var latSchema = z.number().min(-90).max(90);
var lngSchema = z.number().min(-180).max(180);
var orderCreateInputSchema = z.object({
  requestedCans: z.number().int().positive().optional(),
  // [14 J2] 구매-only 주문은 폐유 0 → requestedKg 0 허용(폐유 성분 상한 500kg은 유지).
  requestedKg: z.number().min(0).max(500),
  // [14 J2] 신유 구매 통수(18L 1종 단일 SKU, 1..50). 있으면 order_kind=PURCHASE/MIXED.
  purchaseCans: z.number().int().min(1).max(50).optional(),
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema,
  preferredTime: z.string().min(1)
}).refine((v) => v.requestedKg >= 1 || (v.purchaseCans ?? 0) >= 1, {
  message: "\uD3D0\uC720 \uC218\uAC70 \uB610\uB294 \uC2E0\uC720 \uAD6C\uB9E4 \uC911 \uD558\uB098\uB294 \uC120\uD0DD\uD574\uC57C \uD574\uC694."
});
var orderCreateOutputSchema = z.object({
  orderId: uuidSchema,
  snapshotPricePerKg: z.number().int().positive(),
  estimatedCash: z.number().int().nonnegative()
});
var orderAcceptInputSchema = z.object({
  orderId: uuidSchema
});
var orderAcceptOutputSchema = z.object({
  orderId: uuidSchema,
  status: z.literal("ACCEPTED"),
  acceptedAt: z.string()
});
var arrivePayloadSchema = z.undefined().or(z.object({}).strict());
var payoutMethodSchema = z.enum(["CASH", "POINT"]);
var pickupGeoSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  capturedAt: z.string().optional()
  // ISO8601 촬영 시각(디바이스). 서버 now()와 별개 기록.
});
var submitMeasurePayloadSchema = z.object({
  measuredKg: kgSchema,
  photoUrls: z.array(z.string().url()).min(1),
  payoutMethod: payoutMethodSchema,
  barcodes: z.array(z.string().min(1)).max(50).optional(),
  geo: pickupGeoSchema.optional(),
  // [14 J2] 현장 실배달 신유 통수(구매 동반 주문 필수 0..50 — 필수 강제는 RPC가 order_kind로 판정).
  deliveredCans: z.number().int().min(0).max(50).optional()
});
var confirmMeasurePayloadSchema = z.undefined().or(z.object({}).strict());
var disputePayloadSchema = z.object({
  reason: z.string().min(1)
});
var resolveDisputePayloadSchema = z.object({
  finalKg: kgSchema
});
var deliverPayloadSchema = z.object({
  depotId: uuidSchema,
  qrSecret: z.string().min(1)
});
var orderFaultSchema = z.enum(["SUPPLIER", "RIDER", "SYSTEM"]);
var cancelPayloadSchema = z.object({
  reason: z.string().min(1),
  // supplier 자진취소는 fault 불필요, admin 취소는 필수(RPC가 누락 시 VALIDATION_ERROR).
  fault: orderFaultSchema.optional()
});
var forceCompletePayloadSchema = z.object({
  memo: z.string().min(1)
});
var orderTransitionInputSchema = z.discriminatedUnion("action", [
  z.object({ orderId: uuidSchema, action: z.literal("ARRIVE"), payload: arrivePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("SUBMIT_MEASURE"), payload: submitMeasurePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("CONFIRM_MEASURE"), payload: confirmMeasurePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("DISPUTE"), payload: disputePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("RESOLVE_DISPUTE"), payload: resolveDisputePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("FORCE_COMPLETE"), payload: forceCompletePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("DELIVER"), payload: deliverPayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("CANCEL"), payload: cancelPayloadSchema })
]);
var orderTransitionOutputSchema = z.object({
  orderId: uuidSchema,
  status: z.enum([
    "REQUESTED",
    "ACCEPTED",
    "ARRIVED",
    "PICKED_UP",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
    "DISPUTED"
  ])
});
var orderExpireOutputSchema = z.object({
  rebroadcasted: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative()
});
var riderLocationInputSchema = z.object({
  lat: latSchema,
  lng: lngSchema
});
var riderLocationOutputSchema = z.object({
  updatedAt: z.string()
});
var riderVerifyInputSchema = z.object({
  riderId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "REINSTATED"]),
  rejectReason: z.string().min(1).optional()
});
var riderVerifyOutputSchema = z.object({
  riderId: uuidSchema,
  verifyStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"])
});
var withdrawRequestInputSchema = z.object({
  amount: z.number().int().min(1e4)
});
var withdrawRequestOutputSchema = z.object({
  withdrawalId: uuidSchema,
  status: z.literal("REQUESTED"),
  amount: z.number().int()
});
var withdrawProcessInputSchema = z.object({
  withdrawalId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED", "PAID"]),
  memo: z.string().optional()
});
var withdrawProcessOutputSchema = z.object({
  withdrawalId: uuidSchema,
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "PAID"])
});
var priceSetInputSchema = z.object({
  pricePerKg: z.number().int().positive()
});
var priceSetOutputSchema = z.object({
  id: z.number().int(),
  pricePerKg: z.number().int().positive(),
  effectiveAt: z.string()
});
var orderKindSchema = z.enum(["PICKUP", "PURCHASE", "MIXED"]);
var freshOilPriceSetInputSchema = z.object({
  pricePerCan: z.number().int().positive()
});
var freshOilPriceSetOutputSchema = z.object({
  id: z.number().int(),
  pricePerCan: z.number().int().positive(),
  effectiveAt: z.string()
});
var freshOilPriceTickSchema = z.object({
  id: z.number().int(),
  pricePerCan: z.number().int().positive(),
  effectiveAt: z.string()
});
var pointAdjustInputSchema = z.object({
  userId: uuidSchema,
  amount: z.number().int(),
  memo: z.string().min(1)
});
var pointAdjustOutputSchema = z.object({
  userId: uuidSchema,
  amount: z.number().int()
});
var supplierSignupInputSchema = z.object({
  displayName: z.string().min(1),
  storeName: z.string().min(1),
  bizNumber: z.string().min(1),
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema
});
var supplierProfileUpdateSchema = z.object({
  displayName: z.string().min(1),
  storeName: z.string().min(1),
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema
});
var notifyBroadcastInputSchema = z.object({
  target: z.enum(["ALL", "supplier", "rider"]),
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().optional()
});
var notifyBroadcastOutputSchema = z.object({
  recipientCount: z.number().int().nonnegative()
});
var csCategorySchema = z.enum(["ORDER", "CASH_DISPUTE", "COUPON_PAYMENT", "ACCOUNT", "ETC"]);
var csStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);
var csTicketInputSchema = z.object({
  category: csCategorySchema,
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2e3),
  orderId: uuidSchema.optional()
});
var csReplyInputSchema = z.object({
  ticketId: uuidSchema,
  reply: z.string().min(1).max(2e3),
  status: z.enum(["IN_PROGRESS", "RESOLVED"])
});
var csReplyOutputSchema = z.object({
  ticketId: uuidSchema,
  status: csStatusSchema
});
var referralStatusSchema = z.enum(["SIGNED_UP", "ACTIVATED", "CANCELLED"]);
var referralCodeSchema = z.string().trim().toUpperCase().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, "\uCD94\uCC9C\uCF54\uB4DC \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
var referralCodeOutputSchema = z.object({
  code: referralCodeSchema,
  shareUrl: z.string().url()
});
var referralAttachInputSchema = z.object({
  code: referralCodeSchema
});
var referralAttachOutputSchema = z.object({
  status: referralStatusSchema,
  supplierBonus: z.number().int().nonnegative()
});
var referralStatsSchema = z.object({
  referrer_rider_id: uuidSchema,
  signed_up: z.number().int().nonnegative(),
  activated: z.number().int().nonnegative(),
  supplier_bonus_paid: z.number().int().nonnegative(),
  rider_reward_earned: z.number().int().nonnegative(),
  // [09 H8] 보상 정산 분리 합계(20260716000001에서 뷰에 append).
  rider_reward_settled: z.number().int().nonnegative(),
  rider_reward_unsettled: z.number().int().nonnegative()
});
var referralSettleInputSchema = z.object({
  referralId: uuidSchema,
  settle: z.boolean()
});
var referralSettleOutputSchema = z.object({
  referralId: uuidSchema,
  settled: z.boolean(),
  settledAt: z.string().nullable()
});
var directionsInputSchema = z.object({
  origin: z.object({ lat: latSchema, lng: lngSchema }),
  destination: z.object({ lat: latSchema, lng: lngSchema })
});
var directionsOutputSchema = z.object({
  /** 서버에 KAKAO_MOBILITY_KEY가 설정돼 라우팅이 가능한지. false면 path는 빈 배열. */
  configured: z.boolean(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  /** 경로 폴리라인(출발→도착). MapView가 선으로 그린다. 미구성/실패 시 빈 배열. */
  path: z.array(z.object({ lat: latSchema, lng: lngSchema }))
});
var dealerCreateInputSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/, "\uC544\uC774\uB514\uB294 \uC601\uC18C\uBB38\uC790\xB7\uC22B\uC790\xB7\uBC11\uC904\uB9CC \uAC00\uB2A5\uD574\uC694."),
  password: z.string().min(8, "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD574\uC694."),
  displayName: z.string().min(1).max(40),
  phone: z.string().min(1).max(20)
});
var dealerCreateOutputSchema = z.object({
  dealerId: uuidSchema,
  username: z.string()
});
var dealerAssignInputSchema = z.object({
  riderId: uuidSchema,
  dealerId: uuidSchema.nullable()
});
var dealerAssignOutputSchema = z.object({
  riderId: uuidSchema,
  dealerId: uuidSchema.nullable()
});
var dealerRiderStatsSchema = z.object({
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
  referral_activated: z.number().int().nonnegative()
});
var dealerAccountSetInputSchema = z.object({
  dealerId: uuidSchema,
  depositAmount: z.number().int().min(0),
  creditLimit: z.number().int().min(0),
  claimThreshold: z.number().int().positive(),
  feeRateBp: z.number().int().min(0).max(1e4)
  // 요율(bp, 1bp=0.01%). 초기 0
});
var dealerAccountSchema = z.object({
  dealer_id: uuidSchema,
  deposit_amount: z.number().int(),
  credit_limit: z.number().int(),
  claim_threshold: z.number().int(),
  fee_rate_bp: z.number().int()
});
var dealerClaimInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), dealerId: uuidSchema }),
  z.object({ action: z.literal("settle"), settlementId: uuidSchema }),
  z.object({ action: z.literal("void"), settlementId: uuidSchema })
]);
var dealerSettlementStatusSchema = z.enum(["CLAIMED", "SETTLED", "VOID"]);
var dealerSettlementSchema = z.object({
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
  voided_at: z.string().nullable()
});
var dealerStatementSchema = z.object({
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
  unsettled_gross: z.number().int()
});
export {
  arrivePayloadSchema,
  cancelPayloadSchema,
  confirmMeasurePayloadSchema,
  csCategorySchema,
  csReplyInputSchema,
  csReplyOutputSchema,
  csStatusSchema,
  csTicketInputSchema,
  dealerAccountSchema,
  dealerAccountSetInputSchema,
  dealerAssignInputSchema,
  dealerAssignOutputSchema,
  dealerClaimInputSchema,
  dealerCreateInputSchema,
  dealerCreateOutputSchema,
  dealerRiderStatsSchema,
  dealerSettlementSchema,
  dealerSettlementStatusSchema,
  dealerStatementSchema,
  deliverPayloadSchema,
  directionsInputSchema,
  directionsOutputSchema,
  disputePayloadSchema,
  errorResponseSchema,
  forceCompletePayloadSchema,
  freshOilPriceSetInputSchema,
  freshOilPriceSetOutputSchema,
  freshOilPriceTickSchema,
  notifyBroadcastInputSchema,
  notifyBroadcastOutputSchema,
  okResponseSchema,
  orderAcceptInputSchema,
  orderAcceptOutputSchema,
  orderCreateInputSchema,
  orderCreateOutputSchema,
  orderExpireOutputSchema,
  orderFaultSchema,
  orderKindSchema,
  orderTransitionInputSchema,
  orderTransitionOutputSchema,
  payoutMethodSchema,
  pickupGeoSchema,
  pointAdjustInputSchema,
  pointAdjustOutputSchema,
  priceSetInputSchema,
  priceSetOutputSchema,
  referralAttachInputSchema,
  referralAttachOutputSchema,
  referralCodeOutputSchema,
  referralCodeSchema,
  referralSettleInputSchema,
  referralSettleOutputSchema,
  referralStatsSchema,
  referralStatusSchema,
  resolveDisputePayloadSchema,
  riderLocationInputSchema,
  riderLocationOutputSchema,
  riderVerifyInputSchema,
  riderVerifyOutputSchema,
  submitMeasurePayloadSchema,
  supplierProfileUpdateSchema,
  supplierSignupInputSchema,
  withdrawProcessInputSchema,
  withdrawProcessOutputSchema,
  withdrawRequestInputSchema,
  withdrawRequestOutputSchema
};

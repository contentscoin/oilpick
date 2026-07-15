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
var requestedKgSchema = z.number().min(1).max(500);
var kgSchema = z.number().nonnegative();
var latSchema = z.number().min(-90).max(90);
var lngSchema = z.number().min(-180).max(180);
var orderCreateInputSchema = z.object({
  requestedCans: z.number().int().positive().optional(),
  requestedKg: requestedKgSchema,
  address: z.string().min(1),
  lat: latSchema,
  lng: lngSchema,
  preferredTime: z.string().min(1)
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
var submitMeasurePayloadSchema = z.object({
  measuredKg: kgSchema,
  photoUrls: z.array(z.string().url()).min(1),
  payoutMethod: payoutMethodSchema
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
export {
  arrivePayloadSchema,
  cancelPayloadSchema,
  confirmMeasurePayloadSchema,
  csCategorySchema,
  csReplyInputSchema,
  csReplyOutputSchema,
  csStatusSchema,
  csTicketInputSchema,
  deliverPayloadSchema,
  disputePayloadSchema,
  errorResponseSchema,
  forceCompletePayloadSchema,
  notifyBroadcastInputSchema,
  notifyBroadcastOutputSchema,
  okResponseSchema,
  orderAcceptInputSchema,
  orderAcceptOutputSchema,
  orderCreateInputSchema,
  orderCreateOutputSchema,
  orderExpireOutputSchema,
  orderFaultSchema,
  orderTransitionInputSchema,
  orderTransitionOutputSchema,
  payoutMethodSchema,
  pointAdjustInputSchema,
  pointAdjustOutputSchema,
  priceSetInputSchema,
  priceSetOutputSchema,
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

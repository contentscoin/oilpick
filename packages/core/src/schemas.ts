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

export const orderCreateOutputSchema = z.object({
  orderId: uuidSchema,
  snapshotPricePerKg: z.number().int().positive(),
  snapshotRiderFee: z.number().int().positive(),
  estimatedPoint: z.number().int().nonnegative(),
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

export const cancelPayloadSchema = z.object({
  reason: z.string().min(1),
});

/** action 판별로 payload 타입을 좁히는 discriminated union. */
export const orderTransitionInputSchema = z.discriminatedUnion("action", [
  z.object({ orderId: uuidSchema, action: z.literal("ARRIVE"), payload: arrivePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("SUBMIT_MEASURE"), payload: submitMeasurePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("CONFIRM_MEASURE"), payload: confirmMeasurePayloadSchema.optional() }),
  z.object({ orderId: uuidSchema, action: z.literal("DISPUTE"), payload: disputePayloadSchema }),
  z.object({ orderId: uuidSchema, action: z.literal("RESOLVE_DISPUTE"), payload: resolveDisputePayloadSchema }),
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

export const riderVerifyInputSchema = z.object({
  riderId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectReason: z.string().min(1).optional(),
});
export type RiderVerifyInput = z.infer<typeof riderVerifyInputSchema>;

export const riderVerifyOutputSchema = z.object({
  riderId: uuidSchema,
  verifyStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
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

export const priceSetInputSchema = z.object({
  pricePerKg: z.number().int().positive(),
  riderFee: z.number().int().positive(),
});
export type PriceSetInput = z.infer<typeof priceSetInputSchema>;

export const priceSetOutputSchema = z.object({
  id: z.number().int(),
  pricePerKg: z.number().int().positive(),
  riderFee: z.number().int().positive(),
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

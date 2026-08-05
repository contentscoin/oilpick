import { describe, expect, it } from "vitest";
import {
  couponPurchaseIntentInputSchema,
  couponPurchaseIntentOutputSchema,
  couponPurchaseConfirmInputSchema,
  couponPurchaseConfirmOutputSchema,
  couponRefundInputSchema,
  couponRefundOutputSchema,
} from "./schemas";
import { PAYMENT_FAILED, ERROR_MESSAGE_KO } from "./errorCodes";

// 07 F4: coupon-purchase-intent/confirm/refund zod 계약. Edge Function과 라이더/어드민
// 클라이언트가 동일 스키마로 검증한다(02-api.md 공통 규칙).

describe("couponPurchaseIntentInputSchema", () => {
  it("qty 1~200 정수만 허용", () => {
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 10 }).success).toBe(true);
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 1 }).success).toBe(true);
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 200 }).success).toBe(true);
  });

  it("범위 밖·비정수 거부", () => {
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 0 }).success).toBe(false);
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 201 }).success).toBe(false);
    expect(couponPurchaseIntentInputSchema.safeParse({ qty: 1.5 }).success).toBe(false);
    expect(couponPurchaseIntentInputSchema.safeParse({}).success).toBe(false);
  });

  it("intent 출력: purchaseId/pgOrderId/amount/unitPrice", () => {
    const out = couponPurchaseIntentOutputSchema.safeParse({
      purchaseId: "11111111-1111-1111-1111-111111111111",
      pgOrderId: "oc_abc",
      amount: 5000,
      unitPrice: 500,
    });
    expect(out.success).toBe(true);
  });
});

describe("couponPurchaseConfirmInputSchema", () => {
  it("토스 successUrl 파라미터 4종 필수", () => {
    const ok = couponPurchaseConfirmInputSchema.safeParse({
      purchaseId: "11111111-1111-1111-1111-111111111111",
      paymentKey: "tk_1",
      pgOrderId: "oc_abc",
      amount: 5000,
    });
    expect(ok.success).toBe(true);
  });

  it("paymentKey 빈 문자열·amount 누락 거부", () => {
    expect(
      couponPurchaseConfirmInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        paymentKey: "",
        pgOrderId: "oc_abc",
        amount: 5000,
      }).success,
    ).toBe(false);
    expect(
      couponPurchaseConfirmInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        paymentKey: "tk_1",
        pgOrderId: "oc_abc",
      }).success,
    ).toBe(false);
  });

  it("confirm 출력은 {balance}", () => {
    expect(couponPurchaseConfirmOutputSchema.safeParse({ balance: 12 }).success).toBe(true);
    expect(couponPurchaseConfirmOutputSchema.safeParse({ balance: -1 }).success).toBe(false);
  });
});

describe("couponRefundInputSchema", () => {
  it("qty 생략(전액)·지정(부분) 모두 허용, reason 필수", () => {
    expect(
      couponRefundInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        reason: "고객 요청",
      }).success,
    ).toBe(true);
    expect(
      couponRefundInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        qty: 3,
        reason: "부분 환불",
      }).success,
    ).toBe(true);
  });

  it("reason 누락·qty 0/음수 거부", () => {
    expect(
      couponRefundInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      couponRefundInputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        qty: 0,
        reason: "x",
      }).success,
    ).toBe(false);
  });

  it("refund 출력: purchaseId/refundedQty/balance", () => {
    expect(
      couponRefundOutputSchema.safeParse({
        purchaseId: "11111111-1111-1111-1111-111111111111",
        refundedQty: 4,
        balance: 6,
      }).success,
    ).toBe(true);
  });
});

describe("PAYMENT_FAILED 에러코드", () => {
  it("코드 상수·한글 메시지 등록", () => {
    expect(PAYMENT_FAILED).toBe("PAYMENT_FAILED");
    expect(ERROR_MESSAGE_KO.PAYMENT_FAILED).toContain("결제");
  });
});

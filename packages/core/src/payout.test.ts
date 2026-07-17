// 08 피벗 계약 테스트 — 지급수단(payoutMethod)·주문 생성 출력·라벨.
// docs/spec/08-payout-pivot.md P1(couponCost 삭제)·P2(SUBMIT_MEASURE payoutMethod 필수) 검증.

import { describe, expect, it } from "vitest";
import {
  PAYOUT_METHOD_LABEL,
  orderCreateOutputSchema,
  orderTransitionInputSchema,
  payoutMethodSchema,
  submitMeasurePayloadSchema,
} from "./index";

const ORDER_ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";
const PHOTO = "https://example.com/p.jpg";

describe("payoutMethodSchema (08 P2)", () => {
  it("CASH/POINT만 허용한다", () => {
    expect(payoutMethodSchema.safeParse("CASH").success).toBe(true);
    expect(payoutMethodSchema.safeParse("POINT").success).toBe(true);
    expect(payoutMethodSchema.safeParse("POINTS").success).toBe(false);
    expect(payoutMethodSchema.safeParse("cash").success).toBe(false);
  });
});

describe("SUBMIT_MEASURE payload (08 P2)", () => {
  const base = { measuredKg: 45.5, photoUrls: [PHOTO] };

  it("payoutMethod 필수 — 누락 시 거부(신 클라이언트 강제)", () => {
    expect(submitMeasurePayloadSchema.safeParse(base).success).toBe(false);
    expect(
      submitMeasurePayloadSchema.safeParse({ ...base, payoutMethod: "CASH" }).success,
    ).toBe(true);
    expect(
      submitMeasurePayloadSchema.safeParse({ ...base, payoutMethod: "POINT" }).success,
    ).toBe(true);
  });

  it("discriminated union 경유(order-transition 입력)에서도 payoutMethod가 강제된다", () => {
    const without = orderTransitionInputSchema.safeParse({
      orderId: ORDER_ID,
      action: "SUBMIT_MEASURE",
      payload: base,
    });
    expect(without.success).toBe(false);

    const withMethod = orderTransitionInputSchema.safeParse({
      orderId: ORDER_ID,
      action: "SUBMIT_MEASURE",
      payload: { ...base, payoutMethod: "POINT" },
    });
    expect(withMethod.success).toBe(true);
  });
});

describe("order-create 출력 (08 P1 — couponCost 삭제)", () => {
  it("couponCost 없는 응답을 수용하고, 계약 형태를 유지한다", () => {
    const parsed = orderCreateOutputSchema.safeParse({
      orderId: ORDER_ID,
      snapshotPricePerKg: 700,
      estimatedCash: 10500,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("couponCost" in parsed.data).toBe(false);
    }
  });
});

describe("PAYOUT_METHOD_LABEL", () => {
  it("현금/포인트 한글 라벨을 제공한다", () => {
    expect(PAYOUT_METHOD_LABEL.CASH).toBe("현금");
    expect(PAYOUT_METHOD_LABEL.POINT).toBe("포인트");
  });
});

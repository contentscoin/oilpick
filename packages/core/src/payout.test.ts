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

  // [O2 2026-08-05] 바코드 사진 첨부 — barcodeItems([{code, photoUrl?}]) 선택 필드.
  it("barcodeItems — photoUrl 선택·code 필수·URL 형식·최대 50건(O2)", () => {
    const withPayout = { ...base, payoutMethod: "CASH" };
    // 사진 있는 항목 + 없는 항목 혼재 허용(photoUrl 생략 가능).
    expect(
      submitMeasurePayloadSchema.safeParse({
        ...withPayout,
        barcodeItems: [{ code: "8801234567890", photoUrl: PHOTO }, { code: "photo-abc12345" }],
      }).success,
    ).toBe(true);
    // 생략 가능(구버전 barcodes 경로 호환).
    expect(submitMeasurePayloadSchema.safeParse(withPayout).success).toBe(true);
    // code 빈 문자열·photoUrl 비URL 거부.
    expect(
      submitMeasurePayloadSchema.safeParse({ ...withPayout, barcodeItems: [{ code: "" }] }).success,
    ).toBe(false);
    expect(
      submitMeasurePayloadSchema.safeParse({
        ...withPayout,
        barcodeItems: [{ code: "AAA", photoUrl: "not-a-url" }],
      }).success,
    ).toBe(false);
    // 51건 초과 거부(barcodes와 동일 상한).
    expect(
      submitMeasurePayloadSchema.safeParse({
        ...withPayout,
        barcodeItems: Array.from({ length: 51 }, (_, i) => ({ code: `C${i}` })),
      }).success,
    ).toBe(false);
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

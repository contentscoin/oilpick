import { describe, expect, it } from "vitest";
import { estimateCash, estimateKg } from "./estimate";
import { KG_PER_CAN } from "./constants";

describe("estimateKg", () => {
  it("multiplies can count by KG_PER_CAN (15kg)", () => {
    expect(estimateKg(1)).toBe(15);
    expect(estimateKg(3)).toBe(45);
    expect(estimateKg(10)).toBe(150);
  });

  it("uses the shared KG_PER_CAN constant", () => {
    expect(estimateKg(2)).toBe(2 * KG_PER_CAN);
  });

  it("returns 0 for 0 cans", () => {
    expect(estimateKg(0)).toBe(0);
  });

  it("defaults to the 18L 말통 (KG_PER_CAN) when canSizeL is omitted", () => {
    // 07 F9-③ 프리셋 도입 후에도 단일 인자 호출은 기존과 동일해야 한다(하위 호환).
    expect(estimateKg(1, 18)).toBe(15);
    expect(estimateKg(3, 18)).toBe(45);
  });

  it("scales proportionally for a 10L can (18L 대비 비례 환산)", () => {
    // 1통 10L = 15 × 10/18 = 8.333… → 소수 1자리 반올림 8.3kg.
    expect(estimateKg(1, 10)).toBe(8.3);
    // 3통 10L = 3 × 8.333… = 25.0kg.
    expect(estimateKg(3, 10)).toBe(25);
  });

  it("rounds proportional results to 1 decimal (numeric(8,1))", () => {
    // 2통 10L = 2 × 8.333… = 16.666… → 16.7kg.
    expect(estimateKg(2, 10)).toBe(16.7);
  });
});

describe("estimateCash", () => {
  it("multiplies kg by price per kg and rounds to nearest won", () => {
    expect(estimateCash(10, 1000)).toBe(10000);
    expect(estimateCash(45.5, 1200)).toBe(54600);
  });

  it("rounds fractional results to the nearest won", () => {
    expect(estimateCash(1, 1000.4)).toBe(1000);
    expect(estimateCash(1, 1000.6)).toBe(1001);
  });

  it("returns 0 for 0 kg", () => {
    expect(estimateCash(0, 1500)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { estimateKg, estimatePoint } from "./estimate";
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
});

describe("estimatePoint", () => {
  it("multiplies kg by price per kg and rounds to nearest integer", () => {
    expect(estimatePoint(10, 1000)).toBe(10000);
    expect(estimatePoint(45.5, 1200)).toBe(54600);
  });

  it("rounds fractional results to the nearest won/point", () => {
    expect(estimatePoint(1, 1000.4)).toBe(1000);
    expect(estimatePoint(1, 1000.6)).toBe(1001);
  });

  it("returns 0 for 0 kg", () => {
    expect(estimatePoint(0, 1500)).toBe(0);
  });
});

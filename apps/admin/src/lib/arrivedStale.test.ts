import { describe, expect, it } from "vitest";
import { isArrivedStale } from "./arrivedStale";

// 07 F12-⑤: ARRIVED 24h 초과 체류 판정. now를 주입해 시간을 고정(mock 시간)한다.
const NOW = Date.parse("2026-07-09T12:00:00.000Z");

describe("isArrivedStale", () => {
  it("ARRIVED로 24h를 초과하면 stale", () => {
    const arrivedAt = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    expect(isArrivedStale("ARRIVED", arrivedAt, NOW)).toBe(true);
  });

  it("ARRIVED지만 24h 이내면 stale 아님", () => {
    const arrivedAt = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();
    expect(isArrivedStale("ARRIVED", arrivedAt, NOW)).toBe(false);
  });

  it("정확히 24h 경계는 stale 아님(초과만)", () => {
    const arrivedAt = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    expect(isArrivedStale("ARRIVED", arrivedAt, NOW)).toBe(false);
  });

  it("ARRIVED가 아니면 오래돼도 stale 아님", () => {
    const arrivedAt = new Date(NOW - 100 * 60 * 60 * 1000).toISOString();
    expect(isArrivedStale("COMPLETED", arrivedAt, NOW)).toBe(false);
    expect(isArrivedStale("DISPUTED", arrivedAt, NOW)).toBe(false);
  });

  it("arrivedAt이 없으면 stale 아님", () => {
    expect(isArrivedStale("ARRIVED", null, NOW)).toBe(false);
    expect(isArrivedStale("ARRIVED", undefined, NOW)).toBe(false);
  });
});

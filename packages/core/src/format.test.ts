import { describe, expect, it } from "vitest";
import { formatPoint, formatKrw, formatKg, formatRelativeTime, formatTimeOfDay } from "./format";

describe("formatPoint", () => {
  it("formats with thousands separators and P suffix", () => {
    expect(formatPoint(12345)).toBe("12,345P");
    expect(formatPoint(0)).toBe("0P");
    expect(formatPoint(1000000)).toBe("1,000,000P");
  });

  it("truncates fractional input (points are integer)", () => {
    expect(formatPoint(12345.9)).toBe("12,345P");
  });
});

describe("formatKrw", () => {
  it("formats with thousands separators and 원 suffix", () => {
    expect(formatKrw(12345)).toBe("12,345원");
    expect(formatKrw(0)).toBe("0원");
  });
});

describe("formatKg", () => {
  it("always shows exactly one decimal place", () => {
    expect(formatKg(45.5)).toBe("45.5kg");
    expect(formatKg(45)).toBe("45.0kg");
    expect(formatKg(0)).toBe("0.0kg");
  });

  it("rounds to one decimal when given more precision", () => {
    expect(formatKg(45.56)).toBe("45.6kg");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-04T12:00:00Z");

  it("returns '방금 전' for very recent times", () => {
    expect(formatRelativeTime(new Date("2026-07-04T11:59:58Z"), now)).toBe("방금 전");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-07-04T11:55:00Z"), now)).toBe("5분 전");
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime(new Date("2026-07-04T09:00:00Z"), now)).toBe("3시간 전");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime(new Date("2026-07-02T12:00:00Z"), now)).toBe("2일 전");
  });

  it("formats future times with '후' suffix", () => {
    expect(formatRelativeTime(new Date("2026-07-04T12:05:00Z"), now)).toBe("5분 후");
  });

  it("accepts string and number date inputs", () => {
    expect(formatRelativeTime("2026-07-04T11:55:00Z", now)).toBe("5분 전");
    expect(formatRelativeTime(new Date("2026-07-04T11:55:00Z").getTime(), now)).toBe("5분 전");
  });
});

describe("formatTimeOfDay", () => {
  // 로컬 시각 기준으로 판정하므로 테스트도 로컬 Date로 구성(타임존 무관하게 안정적).
  const now = new Date(2026, 6, 4, 12, 0); // 2026-07-04 12:00 local

  it("prefixes '오늘' with HH:mm for same-day times", () => {
    expect(formatTimeOfDay(new Date(2026, 6, 4, 14, 5), now)).toBe("오늘 14:05");
    expect(formatTimeOfDay(new Date(2026, 6, 4, 9, 30), now)).toBe("오늘 09:30");
  });

  it("uses 'M/D HH:mm' for other days", () => {
    expect(formatTimeOfDay(new Date(2026, 6, 1, 14, 5), now)).toBe("7/1 14:05");
    expect(formatTimeOfDay(new Date(2026, 11, 25, 8, 3), now)).toBe("12/25 08:03");
  });

  it("accepts a numeric now for the same-day comparison", () => {
    expect(formatTimeOfDay(new Date(2026, 6, 4, 14, 5), now.getTime())).toBe("오늘 14:05");
  });
});

import { describe, expect, it } from "vitest";
import { formatPoint, formatKrw, formatKg, formatRelativeTime } from "./format";

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

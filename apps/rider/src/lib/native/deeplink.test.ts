import { describe, expect, it, vi } from "vitest";
import { normalizeDeepLink, routeToDeepLink } from "./deeplink";

describe("normalizeDeepLink (rider)", () => {
  it("커스텀 스킴 calls 링크를 앱 경로로 변환한다", () => {
    expect(normalizeDeepLink("oilpick-rider://calls/123")).toBe("/calls/123");
  });

  it("서버가 보내는 /orders/:id 신규 콜 링크를 /calls/:id로 재매핑한다", () => {
    // order-create/order-expire는 rider에게 link="/orders/:id"를 보낸다(공용 표기).
    expect(normalizeDeepLink("/orders/123")).toBe("/calls/123");
    expect(normalizeDeepLink("oilpick-rider://orders/456")).toBe("/calls/456");
  });

  it("출금 알림 /wallet을 /earnings로 재매핑한다", () => {
    expect(normalizeDeepLink("/wallet")).toBe("/earnings");
  });

  it("rider 전용 경로(/verify, /earnings, /calls/:id)는 그대로 둔다", () => {
    expect(normalizeDeepLink("/verify")).toBe("/verify");
    expect(normalizeDeepLink("/earnings")).toBe("/earnings");
    expect(normalizeDeepLink("/calls/9")).toBe("/calls/9");
  });

  it("빈 값/null/외부 URL은 null", () => {
    expect(normalizeDeepLink(null)).toBeNull();
    expect(normalizeDeepLink("")).toBeNull();
    expect(normalizeDeepLink("https://example.com/orders/1")).toBeNull();
  });
});

describe("routeToDeepLink (rider)", () => {
  it("신규 콜 링크를 /calls/:id로 navigate한다", () => {
    const navigate = vi.fn();
    routeToDeepLink(navigate, "/orders/42");
    expect(navigate).toHaveBeenCalledWith("/calls/42");
  });

  it("null 링크에서는 navigate를 호출하지 않는다", () => {
    const navigate = vi.fn();
    routeToDeepLink(navigate, "");
    expect(navigate).not.toHaveBeenCalled();
  });
});

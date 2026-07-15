import { describe, expect, it, vi } from "vitest";
import { normalizeDeepLink, routeToDeepLink } from "./deeplink";

describe("normalizeDeepLink (user)", () => {
  it("커스텀 스킴을 앱 경로로 변환한다", () => {
    expect(normalizeDeepLink("oilpick-user://orders/123")).toBe("/orders/123");
    expect(normalizeDeepLink("oilpick-user://wallet")).toBe("/wallet");
  });

  it("[09 H3] 추천 딥링크를 /ref/:code로 변환한다", () => {
    expect(normalizeDeepLink("oilpick-user://ref/ABCD2345")).toBe("/ref/ABCD2345");
  });

  it("이미 앱 상대경로면 그대로 둔다", () => {
    expect(normalizeDeepLink("/orders/abc")).toBe("/orders/abc");
    expect(normalizeDeepLink("/wallet")).toBe("/wallet");
  });

  it("앞 슬래시가 없으면 붙인다", () => {
    expect(normalizeDeepLink("orders/9")).toBe("/orders/9");
  });

  it("빈 값/공백/null은 null을 반환한다", () => {
    expect(normalizeDeepLink(null)).toBeNull();
    expect(normalizeDeepLink(undefined)).toBeNull();
    expect(normalizeDeepLink("")).toBeNull();
    expect(normalizeDeepLink("   ")).toBeNull();
  });

  it("외부 http(s) URL은 앱 라우팅 대상이 아니므로 null", () => {
    expect(normalizeDeepLink("https://example.com/orders/1")).toBeNull();
  });
});

describe("routeToDeepLink (user)", () => {
  it("정규화된 경로로 navigate를 호출한다", () => {
    const navigate = vi.fn();
    routeToDeepLink(navigate, "oilpick-user://orders/42");
    expect(navigate).toHaveBeenCalledWith("/orders/42");
  });

  it("null 링크에서는 navigate를 호출하지 않는다", () => {
    const navigate = vi.fn();
    routeToDeepLink(navigate, "https://external.example/x");
    expect(navigate).not.toHaveBeenCalled();
  });
});

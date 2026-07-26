import { beforeEach, describe, expect, it, vi } from "vitest";

// 12 S2 재설계: 지오코딩은 geocode Edge Function 경유(브라우저 직접 호출은 CORS 차단).
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("./edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

import { geocodeAddress } from "./geocode";

describe("geocodeAddress (12 S2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Edge Function이 좌표를 주면 그대로 반환한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { configured: true, point: { lat: 37.6, lng: 127.02 } } });
    await expect(geocodeAddress("서울 성북구 장월로 120")).resolves.toEqual({ lat: 37.6, lng: 127.02 });
    expect(mockInvoke).toHaveBeenCalledWith("geocode", { address: "서울 성북구 장월로 120" });
  });

  it("주소를 못 찾으면(point null) null", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { configured: true, point: null } });
    await expect(geocodeAddress("없는주소")).resolves.toBeNull();
  });

  it("서버에 키가 없으면(configured false) null — 호출부가 수동 입력으로 강등", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { configured: false, point: null } });
    await expect(geocodeAddress("서울 성북구 장월로 120")).resolves.toBeNull();
  });

  it("Edge Function 실패는 null(예외를 던지지 않는다)", async () => {
    mockInvoke.mockResolvedValue({ ok: false, code: "UNAUTHORIZED", message: "로그인이 필요해요." });
    await expect(geocodeAddress("서울 성북구 장월로 120")).resolves.toBeNull();
  });

  it("빈 주소는 호출조차 하지 않는다", async () => {
    await expect(geocodeAddress("   ")).resolves.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

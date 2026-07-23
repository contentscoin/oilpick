import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDirections } from "./directions";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("./edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

const INPUT = { origin: { lat: 37.5, lng: 127 }, destination: { lat: 37.55, lng: 126.9 } };

describe("requestDirections (M9-b 배선)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("configured 경로 응답을 그대로 파싱한다", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { configured: true, distanceMeters: 1200, durationSeconds: 300, path: [{ lat: 37.5, lng: 127 }] },
    });
    const out = await requestDirections(INPUT);
    expect(out.configured).toBe(true);
    expect(out.distanceMeters).toBe(1200);
    expect(out.path).toHaveLength(1);
  });

  it("키 미설정(configured:false)이면 비활성 값을 반환한다", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { configured: false, distanceMeters: null, durationSeconds: null, path: [] },
    });
    const out = await requestDirections(INPUT);
    expect(out.configured).toBe(false);
    expect(out.path).toEqual([]);
  });

  it("Edge 실패 시 비활성 기본값으로 강등한다(크래시 금지)", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "오류" });
    const out = await requestDirections(INPUT);
    expect(out).toEqual({ configured: false, distanceMeters: null, durationSeconds: null, path: [] });
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_ALERT_DISMISS_MS,
  CALL_ALERT_EVENT,
  summarizeAddress,
  useCallAlert,
} from "./useCallAlert";

const { mockUseSession, mockUseRiderProfile, mockChannel, mockRemoveChannel, capturedHandlers } =
  vi.hoisted(() => {
    const capturedHandlers: Array<(payload: unknown) => void> = [];
    return {
      capturedHandlers,
      mockUseSession: vi.fn(),
      mockUseRiderProfile: vi.fn(),
      mockRemoveChannel: vi.fn(),
      mockChannel: vi.fn(() => ({
        on: (_evt: string, _cfg: unknown, cb: (payload: unknown) => void) => {
          capturedHandlers.push(cb);
          return { subscribe: () => ({}) };
        },
      })),
    };
  });
vi.mock("./useSession", () => ({ useSession: mockUseSession }));
vi.mock("./useRiderProfile", () => ({ useRiderProfile: mockUseRiderProfile }));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}));

/** Realtime INSERT payload(REQUESTED 콜). */
function insertPayload(overrides: Record<string, unknown> = {}) {
  return {
    new: {
      id: "o1",
      status: "REQUESTED",
      pickup_address: "서울시 강남구 테헤란로 123",
      requested_kg: 5,
      ...overrides,
    },
  };
}

const playSound = vi.fn();
const vibrate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandlers.length = 0;
  // jsdom에는 navigator.vibrate가 없을 수 있어 가드 호출(navigator.vibrate?.)을 spy로 검증한다.
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseRiderProfile.mockReturnValue({ data: { isOnline: true, verifyStatus: "APPROVED" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("summarizeAddress", () => {
  it("시/도·번지를 떼고 구·로 수준만 남긴다", () => {
    expect(summarizeAddress("서울시 강남구 테헤란로 123")).toBe("강남구 테헤란로");
    expect(summarizeAddress("강남구 역삼동")).toBe("강남구 역삼동");
  });
});

describe("useCallAlert — 발화 게이트(06 E3)", () => {
  it("온라인+APPROVED면 REQUESTED INSERT에 배너/알림음/진동 발화", () => {
    const { result } = renderHook(() => useCallAlert({ playSound }));
    expect(capturedHandlers.length).toBe(1);

    act(() => capturedHandlers[0]?.(insertPayload()));

    expect(result.current.alert).toEqual({
      orderId: "o1",
      message: "새 수거 콜 도착 — 강남구 테헤란로 5.0kg",
    });
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it("오프라인(isOnline=false)이면 구독 자체를 하지 않아 미발화", () => {
    mockUseRiderProfile.mockReturnValue({ data: { isOnline: false, verifyStatus: "APPROVED" } });
    const { result } = renderHook(() => useCallAlert({ playSound }));
    expect(mockChannel).not.toHaveBeenCalled();

    // push 커스텀 이벤트도 게이트 밖 — 리스너 미부착으로 미발화.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(CALL_ALERT_EVENT, { detail: { orderId: "o1", title: "t", body: "b" } }),
      );
    });
    expect(result.current.alert).toBeNull();
    expect(playSound).not.toHaveBeenCalled();
  });

  it("미승인(PENDING) 라이더는 미발화", () => {
    mockUseRiderProfile.mockReturnValue({ data: { isOnline: true, verifyStatus: "PENDING" } });
    renderHook(() => useCallAlert({ playSound }));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it("mute 옵션이면 배너/진동은 발화하되 알림음은 생략", () => {
    const { result } = renderHook(() => useCallAlert({ mute: true, playSound }));
    act(() => capturedHandlers[0]?.(insertPayload()));
    expect(result.current.alert?.orderId).toBe("o1");
    expect(playSound).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it("REQUESTED가 아닌 INSERT는 무시", () => {
    const { result } = renderHook(() => useCallAlert({ playSound }));
    act(() => capturedHandlers[0]?.(insertPayload({ status: "ACCEPTED" })));
    expect(result.current.alert).toBeNull();
    expect(playSound).not.toHaveBeenCalled();
  });
});

describe("useCallAlert — push 이벤트 수신 + 이중 수신 dedupe", () => {
  it("push 커스텀 이벤트로도 동일 배너 발화", () => {
    const { result } = renderHook(() => useCallAlert({ playSound }));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(CALL_ALERT_EVENT, {
          detail: { orderId: "o2", title: "새 수거 콜", body: "강남구 테헤란로 5kg" },
        }),
      );
    });
    expect(result.current.alert).toEqual({
      orderId: "o2",
      message: "새 수거 콜 — 강남구 테헤란로 5kg",
    });
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it("같은 orderId를 4초 내 이중 수신(Realtime+push)해도 1회만 발화", () => {
    const { result } = renderHook(() => useCallAlert({ playSound }));
    act(() => capturedHandlers[0]?.(insertPayload()));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(CALL_ALERT_EVENT, { detail: { orderId: "o1", title: "t", body: "b" } }),
      );
    });
    expect(playSound).toHaveBeenCalledTimes(1);
    // 첫 발화(Realtime)의 메시지가 유지된다(push가 덮어쓰지 않음).
    expect(result.current.alert?.message).toContain("새 수거 콜 도착");
  });

  it("배너는 4초 후 자동 소멸", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCallAlert({ playSound }));
    act(() => capturedHandlers[0]?.(insertPayload()));
    expect(result.current.alert).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(CALL_ALERT_DISMISS_MS);
    });
    expect(result.current.alert).toBeNull();
  });
});

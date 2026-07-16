import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReferralCode, useReferralStats } from "./useReferral";
import { queryKeys } from "../lib/queryClient";

/**
 * 09 H4 라이더 추천 훅 회귀 안전망 — ReferralsPage 테스트는 이 모듈을 통째로 모킹하므로
 * 실제 변환 로직(Edge envelope 언랩·에러 표면화, maybeSingle→null, Realtime invalidate)은
 * 여기서만 검증된다.
 */

const { mockFrom, mockChannel, mockRemoveChannel, mockInvokeEdgeFunction } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { from: mockFrom, channel: mockChannel, removeChannel: mockRemoveChannel },
}));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

/** channel().on().subscribe() 체인 스텁 — postgres_changes 콜백을 캡처해 수동 발화할 수 있게 한다. */
function stubChannel() {
  const captured: { callback?: () => void } = {};
  mockChannel.mockReturnValue({
    on: (_event: string, _filter: unknown, cb: () => void) => {
      captured.callback = cb;
      return { subscribe: () => ({}) };
    },
  });
  return captured;
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReferralCode", () => {
  it("referral-code 성공 응답(code/shareUrl)을 반환한다", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { code: "ABCD2345", shareUrl: "https://app.oilpick.kr/ref/ABCD2345" },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralCode(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      code: "ABCD2345",
      shareUrl: "https://app.oilpick.kr/ref/ABCD2345",
    });
    expect(mockInvokeEdgeFunction).toHaveBeenCalledWith("referral-code", {});
  });

  it("Edge 실패 envelope(ok:false)을 에러로 표면화한다", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({ ok: false, message: "권한이 없어요." });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralCode(true), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("권한이 없어요.");
  });

  it("enabled=false면 호출하지 않는다", () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useReferralCode(false), { wrapper });
    expect(mockInvokeEdgeFunction).not.toHaveBeenCalled();
  });
});

describe("useReferralStats", () => {
  function mockStatsRow(row: unknown) {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
    });
  }

  it("v_referral_stats 본인 행을 반환한다", async () => {
    stubChannel();
    const row = {
      referrer_rider_id: "rider-1",
      signed_up: 4,
      activated: 3,
      supplier_bonus_paid: 15000,
      rider_reward_earned: 9000,
      rider_reward_settled: 3000,
      rider_reward_unsettled: 6000,
    };
    mockStatsRow(row);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralStats("rider-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(row);
  });

  it("추천이 없으면(행 없음) null을 반환한다", async () => {
    stubChannel();
    mockStatsRow(null);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralStats("rider-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("referrals Realtime 이벤트 수신 시 실적 키를 invalidate한다", async () => {
    const captured = stubChannel();
    mockStatsRow(null);
    const { client, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result, unmount } = renderHook(() => useReferralStats("rider-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.callback).toBeDefined();
    captured.callback?.();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.referralStats("rider-1") });

    // 언마운트 시 채널 정리(구독 누수 방지).
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});

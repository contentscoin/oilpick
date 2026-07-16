import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReferralDaily, useReferralStatsAdmin } from "./useReferralAdmin";

/**
 * 09 H4 admin 레퍼럴 훅 회귀 안전망 — ReferralsPage 테스트는 이 모듈을 모킹하고 가공 완료된
 * 픽스처를 넣으므로, 실제 변환(이름 join+slice(0,8) 폴백, PostgREST 문자열 numeric의 Number 강제,
 * referralConversionRate 파생, 활성화·가입 2단 정렬)은 여기서만 검증된다.
 */

const { mockFrom, mockChannel, mockRemoveChannel, mockFetchDisplayNameMap } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockFetchDisplayNameMap: vi.fn(),
}));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { from: mockFrom, channel: mockChannel, removeChannel: mockRemoveChannel },
}));
vi.mock("../lib/adminQueries", () => ({
  fetchDisplayNameMap: mockFetchDisplayNameMap,
  sinceIso: (days: number) => `2026-06-${String(46 - days).padStart(2, "0")}`,
}));

function stubChannel() {
  mockChannel.mockReturnValue({
    on: () => ({ subscribe: () => ({}) }),
  });
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReferralStatsAdmin", () => {
  it("문자열 numeric 강제·이름 join(미존재 시 id 프리픽스 폴백)·전환율 파생·2단 정렬을 수행한다", async () => {
    stubChannel();
    // PostgREST는 count/sum 집계를 문자열로 반환할 수 있다 — Number() 강제가 load-bearing.
    mockFrom.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [
            { referrer_rider_id: "rider-aaaa-1111", signed_up: "2", activated: "0", supplier_bonus_paid: "0", rider_reward_earned: "0" },
            { referrer_rider_id: "rider-bbbb-2222", signed_up: "4", activated: "3", supplier_bonus_paid: "15000", rider_reward_earned: "9000" },
          ],
          error: null,
        }),
    });
    // 이름 맵에는 rider-bbbb-2222만 존재 — rider-aaaa-1111은 slice(0,8) 폴백.
    mockFetchDisplayNameMap.mockResolvedValue(new Map([["rider-bbbb-2222", "김라이더"]]));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralStatsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = result.current.data!;
    // 정렬: 활성화 많은 순(3 > 0) — rider-bbbb가 먼저.
    expect(rows[0]).toEqual({
      riderId: "rider-bbbb-2222",
      riderName: "김라이더",
      signedUp: 4,
      activated: 3,
      conversion: 75,
      supplierBonusPaid: 15000,
      riderRewardEarned: 9000,
    });
    // 이름 폴백 + 전환율 0(분모 가드).
    const second = rows[1]!;
    expect(second.riderName).toBe("rider-aa");
    expect(second.conversion).toBe(0);
    expect(typeof second.signedUp).toBe("number");
  });
});

describe("useReferralDaily", () => {
  it("일별 행을 signedUp/activated로 매핑한다(v_referral_daily 교차일 버킷 컬럼)", async () => {
    stubChannel();
    const gte = vi.fn().mockReturnValue({
      order: () =>
        Promise.resolve({
          data: [
            { day: "2026-07-14", signed_up: "3", activated: "1" },
            { day: "2026-07-15", signed_up: 1, activated: 2 },
          ],
          error: null,
        }),
    });
    mockFrom.mockReturnValue({ select: () => ({ gte }) });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferralDaily(30), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { day: "2026-07-14", signedUp: 3, activated: 1 },
      { day: "2026-07-15", signedUp: 1, activated: 2 },
    ]);
    // 최근 days일 하한이 쿼리에 전달된다(sinceIso 경유).
    expect(gte).toHaveBeenCalledWith("day", "2026-06-16");
  });
});

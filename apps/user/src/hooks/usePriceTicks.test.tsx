import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLatestPriceTick, usePriceTicks, usePriceTicksSince } from "./usePriceTicks";

const { mockFrom, mockChannel, mockOn, mockSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

const ROWS = [
  { id: 2, price_per_kg: 720, rider_fee: 5000, effective_at: "2026-07-02T00:00:00Z" },
  { id: 1, price_per_kg: 700, rider_fee: 5000, effective_at: "2026-07-01T00:00:00Z" },
];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePriceTicks", () => {
  it("fetches ticks ordered by effective_at descending and maps snake_case to camelCase", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: ROWS, error: null }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => usePriceTicks(30), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([
      { id: 2, pricePerKg: 720, riderFee: 5000, effectiveAt: "2026-07-02T00:00:00Z" },
      { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("price_ticks");
    expect(mockChannel).toHaveBeenCalledWith("price_ticks_changes_30");
  });
});

describe("usePriceTicksSince", () => {
  /** 창 안(gte→order 종결)·시드(lt→order→limit 종결) 두 쿼리를 모두 지원하는 빌더 목. */
  function sinceBuilder(inWindowRows: unknown[], seedRows: unknown[], spies?: { gte?: ReturnType<typeof vi.fn>; lt?: ReturnType<typeof vi.fn> }) {
    const gte = (spies?.gte ?? vi.fn()).mockReturnValue({
      order: () => Promise.resolve({ data: inWindowRows, error: null }),
    });
    const lt = (spies?.lt ?? vi.fn()).mockReturnValue({
      order: () => ({ limit: () => Promise.resolve({ data: seedRows, error: null }) }),
    });
    return { select: () => ({ gte, lt }), gte, lt };
  }

  it("창 안 오름차순 + 창 직전 시드 1건을 맨 앞에 붙여 반환한다(캐리포워드 시드)", async () => {
    const gte = vi.fn();
    const lt = vi.fn();
    const seedRow = { id: 0, price_per_kg: 650, rider_fee: 5000, effective_at: "2026-06-20T00:00:00Z" };
    mockFrom.mockReturnValue(sinceBuilder(ROWS, [seedRow], { gte, lt }));
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => usePriceTicksSince(30), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(3);
    expect(result.current.data![0]).toEqual({ id: 0, pricePerKg: 650, riderFee: 5000, effectiveAt: "2026-06-20T00:00:00Z" });
    // 범위 필터가 effective_at 컬럼에 적용됐는지(값은 now 의존이라 컬럼만 검증).
    expect(gte).toHaveBeenCalledWith("effective_at", expect.any(String));
    expect(lt).toHaveBeenCalledWith("effective_at", expect.any(String));
    expect(mockFrom).toHaveBeenCalledWith("price_ticks");
    expect(mockChannel).toHaveBeenCalledWith("price_ticks_since_30");
  });

  it("창 이전 tick이 없으면 창 안 tick만 반환한다", async () => {
    mockFrom.mockReturnValue(sinceBuilder(ROWS, []));
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => usePriceTicksSince(30), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(2);
  });

  it("uses a distinct channel per days value", async () => {
    mockFrom.mockReturnValue(sinceBuilder(ROWS, []));
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => usePriceTicksSince(90), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockChannel).toHaveBeenCalledWith("price_ticks_since_90");
  });
});

describe("useLatestPriceTick", () => {
  it("returns the first (most recent) tick from history", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: ROWS, error: null }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => useLatestPriceTick(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.pricePerKg).toBe(720);
  });
});

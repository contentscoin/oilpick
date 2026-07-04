import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLatestPriceTick, usePriceTicks } from "./usePriceTicks";

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

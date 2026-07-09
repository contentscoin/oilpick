import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecentAddresses } from "./useRecentAddresses";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** select().eq().eq().order().limit() 체인을 흉내내며 마지막에 rows를 반환한다. */
function mockRows(rows: unknown[]) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  });
}

describe("useRecentAddresses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses geography GeoJSON to lat/lng, dedupes by address, and keeps the 2 most recent", async () => {
    mockRows([
      { pickup_address: "서울 A", pickup_location: { type: "Point", coordinates: [126.9, 37.55] }, created_at: "2026-07-03" },
      { pickup_address: "서울 A", pickup_location: { type: "Point", coordinates: [126.9, 37.55] }, created_at: "2026-07-02" },
      { pickup_address: "서울 B", pickup_location: { type: "Point", coordinates: [127.1, 37.5] }, created_at: "2026-07-01" },
      { pickup_address: "서울 C", pickup_location: { type: "Point", coordinates: [127.2, 37.4] }, created_at: "2026-06-30" },
    ]);

    const { result } = renderHook(() => useRecentAddresses("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { address: "서울 A", lat: 37.55, lng: 126.9 },
      { address: "서울 B", lat: 37.5, lng: 127.1 },
    ]);
  });

  it("skips rows without a parseable location", async () => {
    mockRows([
      { pickup_address: "좌표 없음", pickup_location: null, created_at: "2026-07-03" },
      { pickup_address: "서울 B", pickup_location: { type: "Point", coordinates: [127.1, 37.5] }, created_at: "2026-07-01" },
    ]);

    const { result } = renderHook(() => useRecentAddresses("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ address: "서울 B", lat: 37.5, lng: 127.1 }]);
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useRecentAddresses(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

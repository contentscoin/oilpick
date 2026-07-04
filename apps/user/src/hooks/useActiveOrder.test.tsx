import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveOrder } from "./useActiveOrder";

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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useActiveOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the user has no in-progress order", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => useActiveOrder("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("maps an in-progress order row to camelCase", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "order-1",
                      status: "ACCEPTED",
                      requested_kg: 30,
                      snapshot_price_per_kg: 700,
                      created_at: "2026-07-01T00:00:00Z",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => useActiveOrder("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: "order-1",
      status: "ACCEPTED",
      requestedKg: 30,
      snapshotPricePerKg: 700,
      createdAt: "2026-07-01T00:00:00Z",
    });
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useActiveOrder(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

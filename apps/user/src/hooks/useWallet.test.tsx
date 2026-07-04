import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePointBalance, useLedger } from "./useWallet";

const { mockFrom, mockChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })),
}));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { from: mockFrom, channel: mockChannel, removeChannel: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePointBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps v_point_balance row to available/held", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { available: 12000, held: 3000 }, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => usePointBalance("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ available: 12000, held: 3000 });
  });

  it("returns zeroed balance when no row exists", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => usePointBalance("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ available: 0, held: 0 });
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => usePointBalance(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps point_ledger rows to camelCase LedgerEntry", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    id: 1,
                    entry_type: "EARN",
                    amount: 10500,
                    memo: null,
                    created_at: "2026-07-01T00:00:00Z",
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useLedger("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 1, entryType: "EARN", amount: 10500, createdAt: "2026-07-01T00:00:00Z", memo: undefined },
    ]);
  });
});

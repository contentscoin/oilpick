import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCouponBalance, useCouponLedger } from "./useCoupons";

const { mockFrom, mockChannel, mockRemoveChannel, capturedHandlers } = vi.hoisted(() => {
  const capturedHandlers: Array<(payload: unknown) => void> = [];
  return {
    capturedHandlers,
    mockFrom: vi.fn(),
    mockRemoveChannel: vi.fn(),
    mockChannel: vi.fn(() => ({
      on: (_evt: string, _cfg: unknown, cb: (payload: unknown) => void) => {
        capturedHandlers.push(cb);
        return { subscribe: () => ({}) };
      },
    })),
  };
});
vi.mock("../lib/supabaseClient", () => ({
  supabase: { from: mockFrom, channel: mockChannel, removeChannel: mockRemoveChannel },
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandlers.length = 0;
});

describe("useCouponBalance", () => {
  it("maps v_coupon_balance.balance", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { balance: 12 }, error: null }) }),
      }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCouponBalance("rider-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(12);
  });

  it("returns 0 when no ledger row exists", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCouponBalance("rider-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("invalidates balance + ledger queries on coupon_ledger INSERT (Realtime)", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { balance: 3 }, error: null }) }),
      }),
    });
    const { wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useCouponBalance("rider-1"), { wrapper });
    await waitFor(() => expect(capturedHandlers.length).toBeGreaterThan(0));
    invalidateSpy.mockClear();
    // Realtime INSERT 콜백 실행 → 두 쿼리 무효화.
    capturedHandlers[capturedHandlers.length - 1]?.({});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["couponBalance", "rider-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["couponLedger", "rider-1"] });
  });

  it("does not query when riderId is undefined", () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useCouponBalance(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useCouponLedger", () => {
  it("maps coupon_ledger rows (qty→amount) to LedgerEntry", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  { id: 1, entry_type: "CHARGE", qty: 30, memo: null, created_at: "2026-07-09T00:00:00Z" },
                  { id: 2, entry_type: "CONSUME", qty: -1, memo: null, created_at: "2026-07-09T01:00:00Z" },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCouponLedger("rider-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 1, entryType: "CHARGE", amount: 30, createdAt: "2026-07-09T00:00:00Z", memo: undefined },
      { id: 2, entryType: "CONSUME", amount: -1, createdAt: "2026-07-09T01:00:00Z", memo: undefined },
    ]);
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCashReceipts, useMonthlyCashReceipt } from "./useCashReceipts";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

/** supabase.from(...).select().eq().in().order().limit() → Promise 체인 모킹. */
function stubOrders(rows: unknown[]) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const nowIso = new Date().toISOString();
const lastMonthIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

describe("useMonthlyCashReceipt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sums this month's cash using the legacy coalesce(completed_at, delivered_at, picked_up_at)", async () => {
    stubOrders([
      // 신모델: completed_at 기준.
      { cash_paid_amount: 30000, completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 레거시: completed_at null → delivered_at으로 coalesce되어 이번 달로 집계.
      { cash_paid_amount: 20000, completed_at: null, delivered_at: nowIso, picked_up_at: null },
      // 지난 달 → 제외.
      { cash_paid_amount: 99999, completed_at: lastMonthIso, delivered_at: null, picked_up_at: null },
      // 현금 없음(레거시 DELIVERED) → 건수/합계 미기여.
      { cash_paid_amount: null, completed_at: nowIso, delivered_at: null, picked_up_at: null },
    ]);

    const { result } = renderHook(() => useMonthlyCashReceipt("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 2, cash: 50000 });
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useMonthlyCashReceipt(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useCashReceipts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps rows to receipts and drops orders without cash_paid_amount", async () => {
    stubOrders([
      { id: "a", cash_paid_amount: 31500, final_kg: 31.5, completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 현금 없음(레거시) → 제외.
      { id: "b", cash_paid_amount: null, final_kg: null, completed_at: null, delivered_at: nowIso, picked_up_at: null },
    ]);

    const { result } = renderHook(() => useCashReceipts("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "a", amount: 31500, finalKg: 31.5, receivedAt: nowIso },
    ]);
  });
});

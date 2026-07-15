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

  it("sums this month's receipts split by payout_method (legacy coalesce + null=CASH)", async () => {
    stubOrders([
      // 신모델 CASH: completed_at 기준.
      { cash_paid_amount: 30000, payout_method: "CASH", completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 신모델 POINT: 포인트 합으로 분리 집계(08 G5-④).
      { cash_paid_amount: 21000, payout_method: "POINT", completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 레거시(payout_method null → CASH 간주): completed_at null → delivered_at으로 coalesce.
      { cash_paid_amount: 20000, payout_method: null, completed_at: null, delivered_at: nowIso, picked_up_at: null },
      // 지난 달 → 제외.
      { cash_paid_amount: 99999, payout_method: "CASH", completed_at: lastMonthIso, delivered_at: null, picked_up_at: null },
      // 지급액 없음(레거시 DELIVERED) → 건수/합계 미기여.
      { cash_paid_amount: null, payout_method: null, completed_at: nowIso, delivered_at: null, picked_up_at: null },
    ]);

    const { result } = renderHook(() => useMonthlyCashReceipt("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 3, cash: 50000, point: 21000 });
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useMonthlyCashReceipt(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useCashReceipts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps rows to receipts (payoutMethod 포함) and drops orders without cash_paid_amount", async () => {
    stubOrders([
      { id: "a", cash_paid_amount: 31500, payout_method: "POINT", final_kg: 31.5, completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 레거시(payout_method null) — 지갑 UI가 CASH로 간주(08 P3).
      { id: "c", cash_paid_amount: 15000, payout_method: null, final_kg: 15.0, completed_at: nowIso, delivered_at: null, picked_up_at: null },
      // 지급액 없음(레거시) → 제외.
      { id: "b", cash_paid_amount: null, payout_method: null, final_kg: null, completed_at: null, delivered_at: nowIso, picked_up_at: null },
    ]);

    const { result } = renderHook(() => useCashReceipts("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "a", amount: 31500, payoutMethod: "POINT", finalKg: 31.5, receivedAt: nowIso },
      { id: "c", amount: 15000, payoutMethod: null, finalKg: 15.0, receivedAt: nowIso },
    ]);
  });
});

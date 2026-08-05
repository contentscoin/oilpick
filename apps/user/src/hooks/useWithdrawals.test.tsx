import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWithdrawals } from "./useWithdrawals";

// U11 "출금 진행" 섹션 데이터 훅 — 본인 withdrawals 조회 전용(쓰기는 Edge Function만, 절대 규칙 1·3).

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

/** supabase.from("withdrawals").select().eq().order().limit() → Promise 체인 모킹. eq 호출을 기록한다. */
const eqCalls: unknown[][] = [];
function stubWithdrawals(rows: unknown[]) {
  eqCalls.length = 0;
  mockFrom.mockReturnValue({
    select: () => ({
      eq: (...args: unknown[]) => {
        eqCalls.push(args);
        return {
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        };
      },
    }),
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const nowIso = new Date().toISOString();

describe("useWithdrawals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps rows to items and applies no status filter (전 상태 4종을 그대로 반환)", async () => {
    stubWithdrawals([
      { id: "w1", amount: 10000, status: "REQUESTED", created_at: nowIso, processed_at: null },
      { id: "w2", amount: 20000, status: "APPROVED", created_at: nowIso, processed_at: nowIso },
      { id: "w3", amount: 30000, status: "PAID", created_at: nowIso, processed_at: nowIso },
      { id: "w4", amount: 40000, status: "REJECTED", created_at: nowIso, processed_at: nowIso },
    ]);

    const { result } = renderHook(() => useWithdrawals("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { id: "w1", amount: 10000, status: "REQUESTED", createdAt: nowIso, processedAt: null },
      { id: "w2", amount: 20000, status: "APPROVED", createdAt: nowIso, processedAt: nowIso },
      { id: "w3", amount: 30000, status: "PAID", createdAt: nowIso, processedAt: nowIso },
      { id: "w4", amount: 40000, status: "REJECTED", createdAt: nowIso, processedAt: nowIso },
    ]);
    // 필터는 본인(user_id) 단 하나 — status eq가 끼면 진행/완결 목록이 잘려 나간다.
    expect(mockFrom).toHaveBeenCalledWith("withdrawals");
    expect(eqCalls).toEqual([["user_id", "user-1"]]);
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useWithdrawals(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

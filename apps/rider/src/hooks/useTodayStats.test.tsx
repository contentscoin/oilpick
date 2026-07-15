import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMonthlyPickupStats, useTodayStats } from "./useTodayStats";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

/** select/eq/in/order는 체인 유지, gte/limit/maybeSingle에서 결과를 resolve하는 쿼리빌더 목. */
function chain(result: { data: unknown; error: null }) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in", "order"]) c[k] = () => c;
  for (const k of ["gte", "limit", "maybeSingle"]) c[k] = () => Promise.resolve(result);
  return c;
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTodayStats — 오늘 실적(08 G6-④, 수단 분리)", () => {
  it("완료 주문 kg + 현금/포인트 지급 분리(레거시 null=CASH)", async () => {
    mockFrom.mockReturnValue(
      chain({
        data: [
          { final_kg: 40, measured_kg: 39, payout_method: "CASH", cash_paid_amount: 64000 },
          { final_kg: null, measured_kg: 20, payout_method: "POINT", cash_paid_amount: 32000 },
          // 레거시(payout_method null) → CASH 간주(08 P3 coalesce).
          { final_kg: 10, measured_kg: 10, payout_method: null, cash_paid_amount: 7000 },
        ],
        error: null,
      }),
    );
    const { result } = renderHook(() => useTodayStats("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      completedCount: 3,
      collectedKg: 70, // 40(final) + 20(measured fallback) + 10
      cashPaid: 71000, // 64000 + 7000(레거시 CASH 간주)
      pointPaid: 32000,
    });
  });
});

describe("useMonthlyPickupStats — 이번 달 실적(08 G6-④, completed_at·coalesce·수단 분리)", () => {
  it("레거시(DELIVERED)/신규(COMPLETED) 혼합 + coalesce 완료시각 + 월 필터", async () => {
    const now = new Date();
    const inMonth = new Date(now.getFullYear(), now.getMonth(), 2, 10).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10).toISOString();

    mockFrom.mockReturnValue(
      chain({
        data: [
          // 신규 완료(CASH): completed_at 기준, cash 기여.
          { status: "COMPLETED", final_kg: 40, measured_kg: 39, payout_method: "CASH", cash_paid_amount: 64000, completed_at: inMonth, delivered_at: null, picked_up_at: null },
          // 신규 완료(POINT): point 기여(08 G6-④ 수단 분리).
          { status: "COMPLETED", final_kg: 15, measured_kg: 15, payout_method: "POINT", cash_paid_amount: 10500, completed_at: inMonth, delivered_at: null, picked_up_at: null },
          // 레거시: delivered_at으로 coalesce, 지급 없음.
          { status: "DELIVERED", final_kg: null, measured_kg: 30, payout_method: null, cash_paid_amount: null, completed_at: null, delivered_at: inMonth, picked_up_at: null },
          // 레거시: picked_up_at으로 coalesce.
          { status: "DELIVERED", final_kg: null, measured_kg: 20, payout_method: null, cash_paid_amount: null, completed_at: null, delivered_at: null, picked_up_at: inMonth },
          // 지난달 완료 — 제외.
          { status: "COMPLETED", final_kg: 50, measured_kg: 50, payout_method: "CASH", cash_paid_amount: 80000, completed_at: lastMonth, delivered_at: null, picked_up_at: null },
        ],
        error: null,
      }),
    );
    const { result } = renderHook(() => useMonthlyPickupStats("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 4, kg: 105, cash: 64000, point: 10500, cashCount: 1, pointCount: 1 });
  });
});

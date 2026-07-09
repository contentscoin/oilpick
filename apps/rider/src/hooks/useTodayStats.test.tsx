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

describe("useTodayStats — 오늘 실적(07 F6-⑥)", () => {
  it("완료 주문 kg/현금 + CONSUME 쿠폰 합", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "pickup_orders"
        ? chain({
            data: [
              { final_kg: 40, measured_kg: 39, cash_paid_amount: 64000 },
              { final_kg: null, measured_kg: 20, cash_paid_amount: 32000 },
            ],
            error: null,
          })
        : chain({ data: [{ qty: -2 }, { qty: -1 }], error: null }),
    );
    const { result } = renderHook(() => useTodayStats("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      completedCount: 2,
      collectedKg: 60, // 40(final) + 20(measured fallback)
      cashPaid: 96000,
      consumedCoupons: 3,
    });
  });
});

describe("useMonthlyPickupStats — 이번 달 실적(07 F6-⑤, completed_at·coalesce)", () => {
  it("레거시(DELIVERED)/신규(COMPLETED) 혼합 + coalesce 완료시각 + 월 필터", async () => {
    const now = new Date();
    const inMonth = new Date(now.getFullYear(), now.getMonth(), 2, 10).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10).toISOString();

    mockFrom.mockReturnValue(
      chain({
        data: [
          // 신규 완료: completed_at 기준, cash 기여.
          { status: "COMPLETED", final_kg: 40, measured_kg: 39, cash_paid_amount: 64000, completed_at: inMonth, delivered_at: null, picked_up_at: null },
          // 레거시: delivered_at으로 coalesce, cash 없음.
          { status: "DELIVERED", final_kg: null, measured_kg: 30, cash_paid_amount: null, completed_at: null, delivered_at: inMonth, picked_up_at: null },
          // 레거시: picked_up_at으로 coalesce.
          { status: "DELIVERED", final_kg: null, measured_kg: 20, cash_paid_amount: null, completed_at: null, delivered_at: null, picked_up_at: inMonth },
          // 지난달 완료 — 제외.
          { status: "COMPLETED", final_kg: 50, measured_kg: 50, cash_paid_amount: 80000, completed_at: lastMonth, delivered_at: null, picked_up_at: null },
        ],
        error: null,
      }),
    );
    const { result } = renderHook(() => useMonthlyPickupStats("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 3, kg: 90, cash: 64000 });
  });
});

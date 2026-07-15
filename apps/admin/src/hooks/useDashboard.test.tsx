import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardKpi } from "./useDashboard";

/**
 * useDashboardKpi 집계 회귀 안전망 (08 G7-② KPI 교체).
 * 오늘 주문 수 / 수거 kg / 현금·포인트 지급 분리(completed_at 기준, payout_method null=CASH 간주) /
 * 출금 대기(withdrawals REQUESTED count) / 활성 라이더. 쿠폰 판매·소진 카드는 제거됐다(08 P1).
 */

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom, channel: vi.fn() } }));

/**
 * useDashboardKpi는 4개 쿼리를 병렬 실행한다:
 *  1) pickup_orders 오늘 주문 수: .select(head+count).gte(created_at)
 *  2) rider_profiles 활성 라이더: .select(head+count).eq().eq()
 *  3) pickup_orders 오늘 완료: .select(...).eq(status,COMPLETED).gte(completed_at)
 *  4) withdrawals 출금 대기: .select(head+count).eq(status,REQUESTED)
 */
function mockSupabase(options: {
  orderCount: number;
  riderCount: number;
  completedRows: Array<{ final_kg: number | null; payout_method: string | null; cash_paid_amount: number | null }>;
  pendingWithdrawals: number;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "pickup_orders") {
      return {
        select: () => ({
          // 오늘 주문 수(count) 체인.
          gte: () => Promise.resolve({ count: options.orderCount, error: null }),
          // 오늘 완료(수거 kg/지급) 체인.
          eq: () => ({
            gte: () => Promise.resolve({ data: options.completedRows, error: null }),
          }),
        }),
      };
    }
    if (table === "withdrawals") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ count: options.pendingWithdrawals, error: null }),
        }),
      };
    }
    // rider_profiles
    return {
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ count: options.riderCount, error: null }),
        }),
      }),
    };
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  mockFrom.mockReset();
});

describe("useDashboardKpi", () => {
  it("현금/포인트 지급 분리 + 출금 대기를 포함한 08 KPI를 집계한다", async () => {
    mockSupabase({
      orderCount: 4,
      riderCount: 3,
      completedRows: [
        { final_kg: 25.5, payout_method: "CASH", cash_paid_amount: 22950 },
        { final_kg: 10, payout_method: "POINT", cash_paid_amount: 9000 },
        // 레거시(payout_method null) → CASH 간주(08 P3 coalesce).
        { final_kg: 5, payout_method: null, cash_paid_amount: 3500 },
      ],
      pendingWithdrawals: 2,
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      orderCount: 4,
      collectedKg: 40.5,
      cashPaidAmount: 26450, // 22950 + 3500(레거시 CASH 간주)
      pointPaidAmount: 9000,
      pendingWithdrawals: 2,
      activeRiderCount: 3,
    });
    // 구모델 필드(쿠폰 판매액/소진 쿠폰)는 존재하지 않는다(08 P1).
    expect(result.current.data).not.toHaveProperty("couponSalesAmount");
    expect(result.current.data).not.toHaveProperty("consumedCoupons");
  });

  it("null 필드(cash/final_kg)는 0으로 방어한다", async () => {
    mockSupabase({
      orderCount: 1,
      riderCount: 0,
      completedRows: [{ final_kg: null, payout_method: null, cash_paid_amount: null }],
      pendingWithdrawals: 0,
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.collectedKg).toBe(0);
    expect(result.current.data?.cashPaidAmount).toBe(0);
    expect(result.current.data?.pointPaidAmount).toBe(0);
  });
});

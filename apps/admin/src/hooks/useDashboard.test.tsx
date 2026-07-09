import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardKpi } from "./useDashboard";

/**
 * useDashboardKpi 집계 회귀 안전망 (07 F10-④ KPI 교체).
 * 오늘 주문 수 / 수거 kg·현금 거래액(completed_at 기준 COMPLETED) /
 * 쿠폰 판매액(Σ CHARGE unit_price×qty) / 소진 쿠폰(Σ |CONSUME qty|) / 활성 라이더.
 * "오늘 발행 포인트"(supplier_point 합)는 제거됐다(D1).
 */

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom, channel: vi.fn() } }));

/**
 * useDashboardKpi는 5개 쿼리를 병렬 실행한다:
 *  1) pickup_orders 오늘 주문 수: .select(head+count).gte(created_at)
 *  2) rider_profiles 활성 라이더: .select(head+count).eq().eq()
 *  3) pickup_orders 오늘 완료: .select(...).eq(status,COMPLETED).gte(completed_at)
 *  4) coupon_ledger CHARGE: .select(...).eq(entry_type,CHARGE).gte(created_at)
 *  5) coupon_ledger CONSUME: .select(...).eq(entry_type,CONSUME).gte(created_at)
 * 각 체인 메서드가 최종 결과로 resolve되는 thenable을 반환하도록 구성한다.
 */
function mockSupabase(options: {
  orderCount: number;
  riderCount: number;
  completedRows: Array<{ final_kg: number | null; cash_paid_amount: number | null }>;
  chargeRows: Array<{ qty: number; unit_price: number | null }>;
  consumeRows: Array<{ qty: number }>;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "pickup_orders") {
      return {
        select: () => ({
          // 오늘 주문 수(count) 체인.
          gte: () => Promise.resolve({ count: options.orderCount, error: null }),
          // 오늘 완료(수거 kg/현금) 체인.
          eq: () => ({
            gte: () => Promise.resolve({ data: options.completedRows, error: null }),
          }),
        }),
      };
    }
    if (table === "coupon_ledger") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            gte: () =>
              Promise.resolve({
                data: value === "CHARGE" ? options.chargeRows : options.consumeRows,
                error: null,
              }),
          }),
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
  it("쿠폰 판매액/소진 쿠폰/현금 거래액을 포함한 신 KPI를 집계한다", async () => {
    mockSupabase({
      orderCount: 4,
      riderCount: 3,
      completedRows: [
        { final_kg: 25.5, cash_paid_amount: 22950 },
        { final_kg: 10, cash_paid_amount: 9000 },
      ],
      chargeRows: [
        { qty: 30, unit_price: 1000 },
        { qty: 10, unit_price: 1200 },
      ],
      consumeRows: [{ qty: -2 }, { qty: -3 }],
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      orderCount: 4,
      collectedKg: 35.5,
      couponSalesAmount: 30 * 1000 + 10 * 1200, // 42,000원
      consumedCoupons: 5,
      activeRiderCount: 3,
      cashPaidAmount: 31950,
    });
    // 구모델 필드(issuedPoint — 오늘 발행 포인트)는 존재하지 않는다.
    expect(result.current.data).not.toHaveProperty("issuedPoint");
  });

  it("null 필드(cash/final_kg/unit_price)는 0으로 방어한다", async () => {
    mockSupabase({
      orderCount: 1,
      riderCount: 0,
      completedRows: [{ final_kg: null, cash_paid_amount: null }],
      chargeRows: [{ qty: 5, unit_price: null }],
      consumeRows: [],
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.collectedKg).toBe(0);
    expect(result.current.data?.cashPaidAmount).toBe(0);
    expect(result.current.data?.couponSalesAmount).toBe(0);
    expect(result.current.data?.consumedCoupons).toBe(0);
  });
});

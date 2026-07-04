import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardKpi } from "./useDashboard";

/**
 * useDashboardKpi 집계 회귀 안전망 (T13).
 * 03-frontend.md "/" 대시보드 KPI: 주문수/수거kg/발행P/활성 라이더.
 * final_kg / supplier_point의 reduce 합산과 null 방어를 Supabase 응답 목으로 검증한다.
 */

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom, channel: vi.fn() } }));

/**
 * useDashboardKpi는 두 쿼리를 병렬 실행한다:
 *  1) pickup_orders: .select(..., {count}).gte(...)  → { data, count, error }
 *  2) rider_profiles: .select(..., {head}).eq().eq() → { count, error }
 * 각 체인 메서드가 최종 결과로 resolve되는 thenable을 반환하도록 구성한다.
 */
function mockSupabase(options: {
  orderRows: Array<{ final_kg: number | null; supplier_point: number | null }>;
  orderCount: number;
  riderCount: number;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "pickup_orders") {
      const result = { data: options.orderRows, count: options.orderCount, error: null };
      return {
        select: () => ({
          gte: () => Promise.resolve(result),
        }),
      };
    }
    // rider_profiles
    const result = { count: options.riderCount, error: null };
    return {
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve(result),
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
  it("final_kg와 supplier_point를 합산하고 주문수/활성 라이더 수를 집계한다", async () => {
    mockSupabase({
      orderRows: [
        { final_kg: 25.5, supplier_point: 22950 },
        { final_kg: 10, supplier_point: 9000 },
      ],
      orderCount: 2,
      riderCount: 3,
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      orderCount: 2,
      collectedKg: 35.5,
      issuedPoint: 31950,
      activeRiderCount: 3,
    });
  });

  it("아직 계량/지급되지 않은 행(final_kg/supplier_point null)은 0으로 처리한다", async () => {
    mockSupabase({
      orderRows: [
        { final_kg: null, supplier_point: null },
        { final_kg: 12, supplier_point: null },
      ],
      orderCount: 2,
      riderCount: 0,
    });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.collectedKg).toBe(12);
    expect(result.current.data?.issuedPoint).toBe(0);
    expect(result.current.data?.activeRiderCount).toBe(0);
  });
});

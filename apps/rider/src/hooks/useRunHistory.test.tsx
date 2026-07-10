import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRunHistory } from "./useRunHistory";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** select/eq/in 인자를 기록하고 range에서 rows를 resolve하는 쿼리빌더 목. */
function makeBuilder(rows: unknown[]) {
  const calls: { select?: string; eq?: [string, string]; in?: [string, string[]] } = {};
  const builder = {
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    eq(column: string, value: string) {
      calls.eq = [column, value];
      return builder;
    },
    in(column: string, values: string[]) {
      calls.in = [column, values];
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return { builder, calls };
}

describe("useRunHistory — 운행 이력(06 E9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("본인(rider_id)의 완료/취소 주문을 camelCase로 매핑하고, 페이지 크기 미만이면 다음 페이지 없음", async () => {
    const { builder, calls } = makeBuilder([
      {
        id: "order-1",
        status: "COMPLETED",
        pickup_address: "서울 강남구 역삼로 111",
        requested_kg: 30,
        final_kg: 29.5,
        cash_paid_amount: 20650,
        coupon_cost: 1,
        created_at: "2026-07-01T00:00:00Z",
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useRunHistory("rider-1", 0), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      items: [
        {
          id: "order-1",
          status: "COMPLETED",
          pickupAddress: "서울 강남구 역삼로 111",
          requestedKg: 30,
          finalKg: 29.5,
          cashPaidAmount: 20650,
          couponCost: 1,
          createdAt: "2026-07-01T00:00:00Z",
        },
      ],
      hasNextPage: false,
    });

    // 필터: 본인 배정(rider_id) + 종료 상태(COMPLETED/CANCELLED)만.
    expect(calls.eq).toEqual(["rider_id", "rider-1"]);
    expect(calls.in).toEqual(["status", ["COMPLETED", "CANCELLED"]]);
    // ⚠️ 07 D1 — 구모델 수거비(snapshot_rider_fee)는 조회 자체를 금지.
    expect(calls.select).not.toContain("snapshot_rider_fee");
  });

  it("페이지 크기(10)보다 많은 행이 오면 hasNextPage true + 10건으로 절단", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `order-${i}`,
      status: "COMPLETED",
      pickup_address: "서울 강남구 역삼로 111",
      requested_kg: 30,
      final_kg: 29.5,
      cash_paid_amount: 20650,
      coupon_cost: 1,
      created_at: "2026-07-01T00:00:00Z",
    }));
    mockFrom.mockReturnValue(makeBuilder(rows).builder);

    const { result } = renderHook(() => useRunHistory("rider-1", 0), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(10);
    expect(result.current.data?.hasNextPage).toBe(true);
  });

  it("riderId가 없으면 쿼리하지 않는다", () => {
    renderHook(() => useRunHistory(undefined, 0), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

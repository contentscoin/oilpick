import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveRun } from "./useActiveRun";

const { mockFrom, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockChannel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })),
}));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { from: mockFrom, channel: mockChannel, removeChannel: mockRemoveChannel },
}));

/**
 * 테이블별 체인 목: pickup_orders(select→eq→in→order→limit) + profiles(select→eq→maybeSingle
 * — E8-④ supplier 전화 2쿼리).
 * [다중 콜] 활성 주문이 최대 3건이라 pickup_orders 체인은 maybeSingle이 아니라 limit에서
 * **행 배열**을 돌려준다. 훅이 그중 표시 대상 한 건을 고른다(pickRun).
 */
function mockRow(
  row: unknown,
  supplier: { data: unknown; error: unknown } = {
    data: { display_name: "왕돈까스", phone: "01012345678" },
    error: null,
  },
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve(supplier) }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: row === null ? [] : [row], error: null }),
            }),
          }),
        }),
      }),
    };
  });
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "ARRIVED",
    supplier_id: "s1",
    depot_id: null,
    pickup_address: "주소",
    pickup_location: "0101000020E6100000713D0AD7A3B45F40E6AE25E483C64240",
    requested_kg: 45,
    measured_kg: null,
    final_kg: null,
    photo_urls: [],
    snapshot_price_per_kg: 1600,
    snapshot_rider_fee: 0,
    coupon_cost: 3,
    cash_paid_amount: null,
    completed_at: null,
    created_at: "2026-07-09T00:00:00Z",
    ...overrides,
  };
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

describe("useActiveRun — COMPLETED 완료 직후 창(07 F6-④)", () => {
  it("최근(창 이내) COMPLETED는 활성 운행으로 노출한다", async () => {
    mockRow(baseRow({ status: "COMPLETED", cash_paid_amount: 64000, completed_at: new Date().toISOString() }));
    const { result } = renderHook(() => useActiveRun("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("COMPLETED");
    expect(result.current.data?.cashPaidAmount).toBe(64000);
  });

  it("오래된 COMPLETED(창 경과)는 null → EmptyState로 콜홈 유도", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockRow(baseRow({ status: "COMPLETED", cash_paid_amount: 64000, completed_at: twoHoursAgo }));
    const { result } = renderHook(() => useActiveRun("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("ARRIVED는 창과 무관하게 활성 운행", async () => {
    mockRow(baseRow({ status: "ARRIVED" }));
    const { result } = renderHook(() => useActiveRun("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("ARRIVED");
  });
});

describe("useActiveRun — supplier 전화/상호(06 E8-④)", () => {
  it("profiles 2쿼리로 supplierPhone/supplierName을 채운다", async () => {
    mockRow(baseRow());
    const { result } = renderHook(() => useActiveRun("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.supplierPhone).toBe("01012345678");
    expect(result.current.data?.supplierName).toBe("왕돈까스");
  });

  it("profiles 조회 실패(RLS 미허용 등)여도 운행은 유지하고 전화만 null", async () => {
    mockRow(baseRow(), { data: null, error: { message: "permission denied" } });
    const { result } = renderHook(() => useActiveRun("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("ARRIVED");
    expect(result.current.data?.supplierPhone).toBeNull();
    expect(result.current.data?.supplierName).toBeNull();
  });
});

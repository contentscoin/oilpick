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

/** from→select→eq→in→order→limit→maybeSingle 체인 목. */
function mockRow(row: unknown) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
          }),
        }),
      }),
    }),
  });
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "ARRIVED",
    supplier_id: "s1",
    depot_id: null,
    pickup_address: "주소",
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

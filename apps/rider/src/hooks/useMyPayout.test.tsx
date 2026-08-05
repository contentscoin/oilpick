import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupOrdersByUtcDay, useMyPayoutOrders } from "./useMyPayout";
import type { PayoutOrderItem } from "./useMyPayout";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

/** select/eq/gte/order는 체인 유지, limit에서 결과를 resolve하는 쿼리빌더 목. */
function chain(result: { data: unknown; error: null }) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "order"]) c[k] = () => c;
  c.limit = () => Promise.resolve(result);
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

function item(overrides: Partial<PayoutOrderItem>): PayoutOrderItem {
  return {
    id: "o-1",
    completedAt: "2026-08-03T05:00:00+00:00",
    pickupAddress: "서울 중구 세종대로 110",
    finalKg: 40,
    payoutMethod: "CASH",
    amount: 30000,
    ...overrides,
  };
}

describe("groupOrdersByUtcDay — 뷰 day(UTC) 규약 일자 묶음", () => {
  it("UTC 일자로 묶는다 — KST 새벽 완료 건(UTC 전일 심야)이 뷰 일별 행과 같은 날짜에 붙는다", () => {
    const groups = groupOrdersByUtcDay([
      item({ id: "a", completedAt: "2026-08-03T05:00:00+00:00" }),
      // KST 08-04 08:30 완료 — 뷰 day는 08-03. 로컬 날짜로 묶으면 어긋나는 케이스.
      item({ id: "b", completedAt: "2026-08-03T23:30:00+00:00" }),
      item({ id: "c", completedAt: "2026-08-04T01:00:00+00:00" }),
    ]);
    expect(Object.keys(groups).sort()).toEqual(["2026-08-03", "2026-08-04"]);
    expect(groups["2026-08-03"]!.map((o) => o.id)).toEqual(["a", "b"]);
    expect(groups["2026-08-04"]!.map((o) => o.id)).toEqual(["c"]);
  });
});

describe("useMyPayoutOrders — 건별 지급 내역(16 L9 §6-2 확장)", () => {
  it("net 우선 금액(coalesce)·레거시 method null=CASH·지급 없음 null 유지로 매핑해 일자별로 묶는다", async () => {
    mockFrom.mockReturnValue(
      chain({
        data: [
          // 상계 주문 — cash_paid_amount(gross)가 아니라 net_amount가 표기 금액.
          { id: "a", completed_at: "2026-08-03T05:00:00+00:00", pickup_address: "매장 A", final_kg: 40, payout_method: "CASH", cash_paid_amount: 64000, net_amount: -3000 },
          { id: "b", completed_at: "2026-08-03T07:00:00+00:00", pickup_address: "매장 B", final_kg: 20, payout_method: "POINT", cash_paid_amount: 28000, net_amount: null },
          // 지급 자체가 없던 완료 주문 — 0이 아니라 null 유지.
          { id: "c", completed_at: "2026-08-02T07:00:00+00:00", pickup_address: "매장 C", final_kg: null, payout_method: null, cash_paid_amount: null, net_amount: null },
        ],
        error: null,
      }),
    );
    const { result } = renderHook(() => useMyPayoutOrders("rider-1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const groups = result.current.data!;
    expect(groups["2026-08-03"]!.map((o) => [o.id, o.payoutMethod, o.amount])).toEqual([
      ["a", "CASH", -3000],
      ["b", "POINT", 28000],
    ]);
    expect(groups["2026-08-02"]![0]).toMatchObject({ id: "c", payoutMethod: "CASH", amount: null });
  });
});

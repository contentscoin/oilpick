import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useOrdersAdmin 모듈이 import하는 supabase 클라이언트는 env 필요 — 체이닝 가능한 빌더로
 * 모킹해 fetchAdminOrders(useAdminOrders의 queryFn 본체)의 페이지네이션/정렬/필터 인자와
 * hasNextPage 판별을 검증한다(05 폴리시 패스).
 */
const mockDb = vi.hoisted(() => {
  const state = {
    /** pickup_orders 조회 결과(테스트별 주입). */
    ordersData: [] as Array<Record<string, unknown>>,
    /** 마지막 pickup_orders 빌더 — order/range/eq/gte/lt 호출 인자 검증용. */
    ordersBuilder: null as Record<string, ReturnType<typeof vi.fn>> | null,
    /** 훅 본체(queryKey 배선) 테스트용 — pickup_orders .range 호출 인자 누적. */
    rangeCalls: [] as unknown[][],
  };

  /** 모든 필터/정렬 메서드가 자기 자신을 반환하고, await 시 결과를 내놓는 thenable 빌더. */
  function chainable(getResult: () => { data: unknown; error: null }) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "range", "eq", "gte", "lt", "in", "limit"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(getResult()).then(onFulfilled, onRejected);
    return builder as Record<string, ReturnType<typeof vi.fn>>;
  }

  return { state, chainable };
});

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    channel: () => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    },
    removeChannel: vi.fn(),
    from: (table: string) => {
      if (table === "pickup_orders") {
        const builder = mockDb.chainable(() => ({ data: mockDb.state.ordersData, error: null }));
        const origRange = builder.range!; // chainable()이 모든 메서드를 채우므로 존재 보장
        builder.range = vi.fn((...args: unknown[]) => {
          mockDb.state.rangeCalls.push(args);
          return origRange(...args);
        });
        mockDb.state.ordersBuilder = builder;
        return builder;
      }
      // supplier_profiles / rider_profiles / order_events — 빈 결과로 충분(이름 매핑은 fallback 경로).
      return mockDb.chainable(() => ({ data: [], error: null }));
    },
  },
}));

import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  DEFAULT_ADMIN_ORDERS_SORT,
  dateFromBoundaryIso,
  dateToExclusiveBoundaryIso,
  fetchAdminOrders,
  useAdminOrders,
} from "./useOrdersAdmin";

function dbRow(i: number): Record<string, unknown> {
  return {
    id: `o-${i}`,
    status: "REQUESTED",
    supplier_id: "supplier-uuid-1",
    rider_id: null,
    requested_kg: "10.0",
    measured_kg: null,
    final_kg: null,
    pickup_address: "서울 강서구",
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  mockDb.state.ordersData = [];
  mockDb.state.ordersBuilder = null;
  mockDb.state.rangeCalls = [];
});

/**
 * 06 E10-① 날짜 범위 경계 — 서버 필터(.gte/.lt)에 들어가는 ISO 경계값 검증.
 * 경계는 브라우저 로컬 자정 기준(목록 toLocaleString 표시와 동일 타임존)이라
 * 기대값도 동일한 Date 산식으로 계산해 타임존 독립적으로 단언한다.
 */
describe("useAdminOrders 날짜 경계 (06 E10-①)", () => {
  it("시작 경계 = 시작일 로컬 자정(포함)", () => {
    expect(dateFromBoundaryIso("2026-07-01")).toBe(new Date("2026-07-01T00:00:00").toISOString());
  });

  it("종료 경계 = 종료일 다음날 로컬 자정(배타) — 종료일 하루 전체가 범위에 포함된다", () => {
    const boundary = dateToExclusiveBoundaryIso("2026-07-10");
    expect(boundary).toBe(new Date("2026-07-11T00:00:00").toISOString());

    // 종료일 23:59:59.999(로컬)는 경계 미만(포함), 다음날 00:00:00은 경계 이상(제외).
    const lastMoment = new Date("2026-07-10T23:59:59.999").toISOString();
    const nextMidnight = new Date("2026-07-11T00:00:00").toISOString();
    expect(lastMoment < boundary).toBe(true);
    expect(nextMidnight < boundary).toBe(false);
  });

  it("월말 경계도 롤오버가 정확하다", () => {
    expect(dateToExclusiveBoundaryIso("2026-07-31")).toBe(new Date("2026-08-01T00:00:00").toISOString());
  });
});

/**
 * 05 폴리시 패스 "admin 테이블 정렬/페이지네이션" — fetchAdminOrders 서버 쿼리 검증.
 * hasNextPage는 페이지 크기+1건 요청 후 초과분 존재 여부로 판별한다(head 카운트 미사용,
 * user 앱 useOrderHistory와 같은 관용구).
 */
describe("fetchAdminOrders 페이지네이션 (05 폴리시 패스)", () => {
  it("페이지 크기+1건을 range로 요청하고, 51건이면 hasNextPage=true + 50건만 반환한다", async () => {
    mockDb.state.ordersData = Array.from({ length: ADMIN_ORDERS_PAGE_SIZE + 1 }, (_, i) => dbRow(i));
    const result = await fetchAdminOrders("ALL", "", "", 0, DEFAULT_ADMIN_ORDERS_SORT);

    expect(mockDb.state.ordersBuilder!.range).toHaveBeenCalledWith(0, ADMIN_ORDERS_PAGE_SIZE);
    expect(result.hasNextPage).toBe(true);
    expect(result.rows).toHaveLength(ADMIN_ORDERS_PAGE_SIZE);
    // 초과분(51번째 행)은 잘려나간다.
    expect(result.rows.some((r) => r.id === `o-${ADMIN_ORDERS_PAGE_SIZE}`)).toBe(false);
  });

  it("페이지 크기 이하면 hasNextPage=false, page에 따라 range 오프셋이 이동한다", async () => {
    mockDb.state.ordersData = [dbRow(0), dbRow(1)];
    const result = await fetchAdminOrders("ALL", "", "", 2, DEFAULT_ADMIN_ORDERS_SORT);

    expect(mockDb.state.ordersBuilder!.range).toHaveBeenCalledWith(
      2 * ADMIN_ORDERS_PAGE_SIZE,
      2 * ADMIN_ORDERS_PAGE_SIZE + ADMIN_ORDERS_PAGE_SIZE,
    );
    expect(result.hasNextPage).toBe(false);
    expect(result.rows).toHaveLength(2);
    // 행 매핑(스네이크→카멜, kg 숫자 변환)도 유지된다.
    expect(result.rows[0]).toMatchObject({ id: "o-0", requestedKg: 10, arrivedAt: null });
  });

  it("정렬 파라미터가 서버 .order로 반영되고 id 타이브레이커가 뒤따른다", async () => {
    mockDb.state.ordersData = [];
    await fetchAdminOrders("ALL", "", "", 0, { column: "requested_kg", ascending: true });

    const orderMock = mockDb.state.ordersBuilder!.order;
    expect(orderMock).toHaveBeenNthCalledWith(1, "requested_kg", { ascending: true });
    // 동률에서 페이지 간 행 중복/누락 방지용 순서 고정.
    expect(orderMock).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("기본 정렬은 요청일 최신순(created_at desc)이다", async () => {
    mockDb.state.ordersData = [];
    await fetchAdminOrders("ALL", "", "", 0, DEFAULT_ADMIN_ORDERS_SORT);

    expect(mockDb.state.ordersBuilder!.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
  });

  it("상태/날짜 필터가 페이지네이션과 함께 eq/gte/lt로 전달된다 (06 E10-① 회귀)", async () => {
    mockDb.state.ordersData = [];
    await fetchAdminOrders("DISPUTED", "2026-07-01", "2026-07-10", 0, DEFAULT_ADMIN_ORDERS_SORT);

    const b = mockDb.state.ordersBuilder!;
    expect(b.eq).toHaveBeenCalledWith("status", "DISPUTED");
    expect(b.gte).toHaveBeenCalledWith("created_at", dateFromBoundaryIso("2026-07-01"));
    expect(b.lt).toHaveBeenCalledWith("created_at", dateToExclusiveBoundaryIso("2026-07-10"));
  });
});

/**
 * 훅 본체 배선 테스트(2026-07-11 리뷰 확정 발견) — fetchAdminOrders 단위 테스트와 OrdersPage의
 * 훅 모킹 사이 접착부인 "queryKey에 page/sort 포함"을 실제 useQuery로 검증한다. queryKey에서
 * page가 빠지면 TanStack Query가 같은 키의 page 0 캐시를 계속 반환해 이 테스트가 잡는다.
 */
describe("useAdminOrders 훅 (queryKey 배선)", () => {
  it("page 변경이 새 오프셋의 서버 조회를 트리거한다", async () => {
    mockDb.state.ordersData = [dbRow(1)];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ page }: { page: number }) => useAdminOrders("ALL", "", "", page, DEFAULT_ADMIN_ORDERS_SORT),
      { wrapper, initialProps: { page: 0 } },
    );
    await waitFor(() => expect(mockDb.state.rangeCalls).toHaveLength(1));
    expect(mockDb.state.rangeCalls[0]).toEqual([0, ADMIN_ORDERS_PAGE_SIZE]);

    rerender({ page: 1 });
    await waitFor(() => expect(mockDb.state.rangeCalls).toHaveLength(2));
    expect(mockDb.state.rangeCalls[1]).toEqual([ADMIN_ORDERS_PAGE_SIZE, ADMIN_ORDERS_PAGE_SIZE * 2]);
  });

  it("정렬 변경도 새 서버 조회를 트리거한다 (queryKey에 sort 포함)", async () => {
    mockDb.state.ordersData = [dbRow(1)];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { rerender } = renderHook(
      ({ asc }: { asc: boolean }) =>
        useAdminOrders("ALL", "", "", 0, { column: "requested_kg", ascending: asc }),
      { wrapper, initialProps: { asc: false } },
    );
    await waitFor(() => expect(mockDb.state.rangeCalls).toHaveLength(1));

    rerender({ asc: true });
    await waitFor(() => expect(mockDb.state.rangeCalls).toHaveLength(2));
  });
});

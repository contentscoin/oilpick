import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";
import type { AdminOrderRow, AdminOrdersSort } from "../hooks/useOrdersAdmin";

// OrdersPage가 useSearchParams(CS→주문 드로어 딥링크, 07 F12)를 쓰므로 Router 컨텍스트로 감싼다.
function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

/**
 * OrdersPage 회귀 안전망 (T13).
 * - 상태 필터 클릭이 useAdminOrders에 전달되는지(03-frontend.md "/orders" 상태 필터)
 * - StatusPill의 주문 상태 한글 라벨
 * - kg 표시 분기: 확정(finalKg) / DISPUTED(계량 vs 예상) / 예상(requestedKg)
 * - 06 E10-①: 텍스트 검색(클라이언트 필터) 목록 축소 / 날짜 범위가 훅에 전달 / CSV 필터 반영
 * - 05 폴리시 패스: 서버 페이지네이션(이전/다음, 필터 변경 시 page 리셋) + 컬럼 정렬 토글
 *
 * useAdminOrders와 상세 훅들을 모킹해 표시/필터 로직만 검증한다.
 */

const { mockUseAdminOrders, mockUseAdminOrderDetail, mockUseAdminOrderEvents, mockToCsv, mockDownloadCsv } =
  vi.hoisted(() => ({
    mockUseAdminOrders: vi.fn(),
    mockUseAdminOrderDetail: vi.fn(),
    mockUseAdminOrderEvents: vi.fn(),
    mockToCsv: vi.fn(),
    mockDownloadCsv: vi.fn(),
  }));

// 실제 모듈은 supabaseClient(env 필요)를 import하므로 상수까지 팩토리에서 직접 제공한다.
vi.mock("../hooks/useOrdersAdmin", () => ({
  ADMIN_ORDERS_PAGE_SIZE: 50,
  DEFAULT_ADMIN_ORDERS_SORT: { column: "created_at", ascending: false },
  useAdminOrders: (statusFilter: string, dateFrom: string, dateTo: string, page: number, sort: AdminOrdersSort) =>
    mockUseAdminOrders(statusFilter, dateFrom, dateTo, page, sort),
  useAdminOrderDetail: (id: string) => mockUseAdminOrderDetail(id),
  useAdminOrderEvents: (id: string) => mockUseAdminOrderEvents(id),
}));

// OrdersPage가 렌더하는 OrderDetailDrawer가 ../lib/edgeFunction → supabaseClient(env 필요)를
// import하므로, 테스트 환경 env 부재로 인한 모듈 로드 실패를 막기 위해 모킹한다.
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: vi.fn() }));

// CSV 내보내기가 필터된 목록 기준인지 검증하기 위해 생성/다운로드 유틸을 모킹한다(06 E10-①③).
vi.mock("../lib/csv", () => ({ toCsv: mockToCsv, downloadCsv: mockDownloadCsv }));

const DEFAULT_SORT: AdminOrdersSort = { column: "created_at", ascending: false };

function order(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: "o-1",
    status: "REQUESTED",
    supplierId: "s-1",
    supplierName: "행복식당",
    riderId: null,
    riderName: null,
    riderVehicle: null,
    requestedKg: 30,
    measuredKg: null,
    finalKg: null,
    orderKind: null,
    deliveredCans: null,
    pickupAddress: "서울 강서구",
    createdAt: "2026-07-01T00:00:00.000Z",
    arrivedAt: null,
    ...overrides,
  };
}

/** useAdminOrders 반환 형태({ rows, hasNextPage }) 모킹 헬퍼 (05 폴리시 패스). */
function ordersResult(rows: AdminOrderRow[], hasNextPage = false) {
  return { data: { rows, hasNextPage }, isLoading: false };
}

afterEach(() => {
  mockUseAdminOrders.mockReset();
  mockUseAdminOrderDetail.mockReset();
  mockUseAdminOrderEvents.mockReset();
  mockToCsv.mockReset();
  mockDownloadCsv.mockReset();
});

describe("OrdersPage", () => {
  it("상태 필터 버튼을 클릭하면 해당 필터값으로 주문을 조회한다", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([]));
    renderPage();
    // 초기 렌더는 ALL·기간 미지정·0페이지·요청일 최신순으로 조회.
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 0, DEFAULT_SORT);

    fireEvent.click(screen.getByTestId("status-filter-DISPUTED"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("DISPUTED", "", "", 0, DEFAULT_SORT);
  });

  it("COMPLETED 주문은 확정 kg을, REQUESTED 주문은 예상 kg을 표시한다", () => {
    mockUseAdminOrders.mockReturnValue(
      ordersResult([
        order({ id: "done", status: "COMPLETED", finalKg: 25, requestedKg: 30 }),
        order({ id: "req", status: "REQUESTED", requestedKg: 12 }),
      ]),
    );
    renderPage();
    expect(screen.getByText("25.0kg (확정)")).toBeInTheDocument();
    expect(screen.getByText("12.0kg (예상)")).toBeInTheDocument();
    // 상태 한글 라벨(StatusPill) — 필터 버튼에도 같은 라벨이 있어 테이블 안으로 스코프한다.
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("완료")).toBeInTheDocument();
    expect(table.getByText("수거 요청됨")).toBeInTheDocument();
  });

  it("DISPUTED 주문은 계량과 예상 kg을 함께 강조 표시한다", () => {
    mockUseAdminOrders.mockReturnValue(
      ordersResult([order({ id: "dsp", status: "DISPUTED", measuredKg: 20, requestedKg: 30, finalKg: null })]),
    );
    renderPage();
    expect(screen.getByText("계량 20.0kg / 예상 30.0kg")).toBeInTheDocument();
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("확인 중")).toBeInTheDocument();
  });

  it("주문이 없으면 안내 문구를 표시한다", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([]));
    renderPage();
    expect(screen.getByText("조건에 맞는 주문이 없어요.")).toBeInTheDocument();
  });

  it("쿼리 실패 시 빈 상태 대신 에러 안내 + 다시 시도(refetch)를 표시한다", () => {
    const refetch = vi.fn();
    mockUseAdminOrders.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPage();
    expect(screen.getByText("주문 목록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText("조건에 맞는 주문이 없어요.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("테이블 하단에 페이지 크기 캡션을 표시한다 (05 폴리시 패스 — 200건 상한 캡션 대체)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([]));
    renderPage();
    expect(screen.getByText("50건씩 표시")).toBeInTheDocument();
    expect(screen.queryByText("최근 200건 기준")).not.toBeInTheDocument();
  });

  it("CSV 내보내기 버튼과 '현재 페이지 기준' 캡션을 노출한다 (07 F10-⑥ / 05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()]));
    renderPage();
    expect(screen.getByTestId("orders-csv-button")).toBeInTheDocument();
    expect(screen.getByText("현재 페이지 기준")).toBeInTheDocument();
  });

  it("검색어를 입력하면 주소/공급업체/차량번호로 목록을 좁힌다 (06 E10-①)", () => {
    mockUseAdminOrders.mockReturnValue(
      ordersResult([
        order({ id: "a", supplierName: "행복식당", pickupAddress: "서울 강서구" }),
        order({
          id: "b",
          supplierName: "김밥천국",
          pickupAddress: "부산 해운대구",
          riderId: "r-1",
          riderName: "김라이더",
          riderVehicle: "12가3456",
        }),
      ]),
    );
    renderPage();
    const input = screen.getByTestId("orders-search-input");

    // 공급업체 상호 매칭
    fireEvent.change(input, { target: { value: "행복" } });
    expect(screen.getByText("행복식당")).toBeInTheDocument();
    expect(screen.queryByText("김밥천국")).not.toBeInTheDocument();

    // 라이더 차량번호 매칭
    fireEvent.change(input, { target: { value: "12가34" } });
    expect(screen.getByText("김밥천국")).toBeInTheDocument();
    expect(screen.queryByText("행복식당")).not.toBeInTheDocument();

    // 주소 매칭 + 매칭 없음 안내
    fireEvent.change(input, { target: { value: "강서구" } });
    expect(screen.getByText("행복식당")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "존재하지않는검색어" } });
    expect(screen.getByText("조건에 맞는 주문이 없어요.")).toBeInTheDocument();
  });

  it("날짜 범위를 입력하면 useAdminOrders에 기간이 전달된다 (06 E10-①)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([]));
    renderPage();
    fireEvent.change(screen.getByTestId("orders-date-from"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByTestId("orders-date-to"), { target: { value: "2026-07-08" } });
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "2026-07-01", "2026-07-08", 0, DEFAULT_SORT);
  });

  it("CSV 내보내기는 검색으로 좁혀진 목록만 담는다 (06 E10-①)", () => {
    mockUseAdminOrders.mockReturnValue(
      ordersResult([order({ id: "a", supplierName: "행복식당" }), order({ id: "b", supplierName: "김밥천국" })]),
    );
    renderPage();
    fireEvent.change(screen.getByTestId("orders-search-input"), { target: { value: "행복" } });
    fireEvent.click(screen.getByTestId("orders-csv-button"));

    expect(mockToCsv).toHaveBeenCalledTimes(1);
    const rows = mockToCsv.mock.calls[0]![1] as Array<Array<string | number | null>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("행복식당");
    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it("ARRIVED 24h 초과 체류 주문에만 하이라이트 배지를 표시한다 (07 F12-⑤)", () => {
    mockUseAdminOrders.mockReturnValue(
      ordersResult([
        // 진입한 지 오래된(2020년) ARRIVED → 24h+ 체류 배지
        order({ id: "stale", status: "ARRIVED", arrivedAt: "2020-01-01T00:00:00.000Z" }),
        // 방금 진입한 ARRIVED → 배지 없음
        order({ id: "fresh", status: "ARRIVED", arrivedAt: new Date().toISOString() }),
      ]),
    );
    renderPage();
    expect(screen.getByTestId("arrived-stale-badge-stale")).toBeInTheDocument();
    expect(screen.queryByTestId("arrived-stale-badge-fresh")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-row-stale-stale")).toBeInTheDocument();
  });

  // ---- 05 폴리시 패스: 서버 페이지네이션 ----

  it("다음/이전 버튼으로 페이지를 이동하고 N페이지를 표시한다 (05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()], true));
    renderPage();
    expect(screen.getByTestId("orders-page-indicator")).toHaveTextContent("1페이지");
    // 0페이지에서 이전은 비활성(user 앱 OrdersHistoryPage와 같은 관용구).
    expect(screen.getByTestId("orders-prev-page")).toBeDisabled();

    fireEvent.click(screen.getByTestId("orders-next-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 1, DEFAULT_SORT);
    expect(screen.getByTestId("orders-page-indicator")).toHaveTextContent("2페이지");
    expect(screen.getByTestId("orders-prev-page")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("orders-prev-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 0, DEFAULT_SORT);
    expect(screen.getByTestId("orders-page-indicator")).toHaveTextContent("1페이지");
  });

  it("hasNextPage=false면 다음 버튼이 비활성화된다 (05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()], false));
    renderPage();
    expect(screen.getByTestId("orders-next-page")).toBeDisabled();
  });

  it("필터(상태/날짜/검색) 변경 시 page가 0으로 리셋된다 (05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()], true));
    renderPage();

    // 상태 필터 변경 → 리셋
    fireEvent.click(screen.getByTestId("orders-next-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 1, DEFAULT_SORT);
    fireEvent.click(screen.getByTestId("status-filter-COMPLETED"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("COMPLETED", "", "", 0, DEFAULT_SORT);

    // 날짜 변경 → 리셋
    fireEvent.click(screen.getByTestId("orders-next-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("COMPLETED", "", "", 1, DEFAULT_SORT);
    fireEvent.change(screen.getByTestId("orders-date-from"), { target: { value: "2026-07-01" } });
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("COMPLETED", "2026-07-01", "", 0, DEFAULT_SORT);

    // 검색어 변경 → 리셋
    fireEvent.click(screen.getByTestId("orders-next-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("COMPLETED", "2026-07-01", "", 1, DEFAULT_SORT);
    fireEvent.change(screen.getByTestId("orders-search-input"), { target: { value: "행복" } });
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("COMPLETED", "2026-07-01", "", 0, DEFAULT_SORT);
  });

  // ---- 05 폴리시 패스: 컬럼 정렬 ----

  it("정렬 헤더 클릭: 같은 컬럼은 asc/desc 토글, 다른 컬럼은 desc로 시작한다 (05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()]));
    renderPage();
    const createdTh = screen.getByTestId("orders-sort-created_at").closest("th")!;
    const kgTh = screen.getByTestId("orders-sort-requested_kg").closest("th")!;

    // 기본: created_at desc — 활성 컬럼에만 aria-sort/▼ 표시.
    expect(createdTh).toHaveAttribute("aria-sort", "descending");
    expect(createdTh).toHaveTextContent("▼");
    expect(kgTh).not.toHaveAttribute("aria-sort");

    // 같은 컬럼 재클릭 → asc 토글
    fireEvent.click(screen.getByTestId("orders-sort-created_at"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 0, { column: "created_at", ascending: true });
    expect(createdTh).toHaveAttribute("aria-sort", "ascending");
    expect(createdTh).toHaveTextContent("▲");

    // 다른 컬럼 클릭 → 그 컬럼 desc로 시작
    fireEvent.click(screen.getByTestId("orders-sort-requested_kg"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 0, {
      column: "requested_kg",
      ascending: false,
    });
    expect(kgTh).toHaveAttribute("aria-sort", "descending");
    expect(kgTh).toHaveTextContent("▼");
    expect(createdTh).not.toHaveAttribute("aria-sort");
  });

  it("정렬 변경 시 page가 0으로 리셋된다 (05 폴리시 패스)", () => {
    mockUseAdminOrders.mockReturnValue(ordersResult([order()], true));
    renderPage();
    fireEvent.click(screen.getByTestId("orders-next-page"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 1, DEFAULT_SORT);

    fireEvent.click(screen.getByTestId("orders-sort-requested_kg"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "", 0, {
      column: "requested_kg",
      ascending: false,
    });
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";
import type { AdminOrderRow } from "../hooks/useOrdersAdmin";

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

vi.mock("../hooks/useOrdersAdmin", () => ({
  useAdminOrders: (statusFilter: string, dateFrom: string, dateTo: string) =>
    mockUseAdminOrders(statusFilter, dateFrom, dateTo),
  useAdminOrderDetail: (id: string) => mockUseAdminOrderDetail(id),
  useAdminOrderEvents: (id: string) => mockUseAdminOrderEvents(id),
}));

// OrdersPage가 렌더하는 OrderDetailDrawer가 ../lib/edgeFunction → supabaseClient(env 필요)를
// import하므로, 테스트 환경 env 부재로 인한 모듈 로드 실패를 막기 위해 모킹한다.
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: vi.fn() }));

// CSV 내보내기가 필터된 목록 기준인지 검증하기 위해 생성/다운로드 유틸을 모킹한다(06 E10-①③).
vi.mock("../lib/csv", () => ({ toCsv: mockToCsv, downloadCsv: mockDownloadCsv }));

function order(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: "o-1",
    status: "REQUESTED",
    supplierId: "s-1",
    supplierName: "행복식당",
    riderId: null,
    riderName: null,
    requestedKg: 30,
    measuredKg: null,
    finalKg: null,
    pickupAddress: "서울 강서구",
    createdAt: "2026-07-01T00:00:00.000Z",
    arrivedAt: null,
    ...overrides,
  };
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
    mockUseAdminOrders.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    // 초기 렌더는 ALL·기간 미지정으로 조회.
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "", "");

    fireEvent.click(screen.getByTestId("status-filter-DISPUTED"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("DISPUTED", "", "");
  });

  it("COMPLETED 주문은 확정 kg을, REQUESTED 주문은 예상 kg을 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [
        order({ id: "done", status: "COMPLETED", finalKg: 25, requestedKg: 30 }),
        order({ id: "req", status: "REQUESTED", requestedKg: 12 }),
      ],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("25.0kg (확정)")).toBeInTheDocument();
    expect(screen.getByText("12.0kg (예상)")).toBeInTheDocument();
    // 상태 한글 라벨(StatusPill) — 필터 버튼에도 같은 라벨이 있어 테이블 안으로 스코프한다.
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("완료")).toBeInTheDocument();
    expect(table.getByText("수거 요청됨")).toBeInTheDocument();
  });

  it("DISPUTED 주문은 계량과 예상 kg을 함께 강조 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [order({ id: "dsp", status: "DISPUTED", measuredKg: 20, requestedKg: 30, finalKg: null })],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("계량 20.0kg / 예상 30.0kg")).toBeInTheDocument();
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("확인 중")).toBeInTheDocument();
  });

  it("주문이 없으면 안내 문구를 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText("조건에 맞는 주문이 없어요.")).toBeInTheDocument();
  });

  it("CSV 내보내기 버튼을 노출한다 (07 F10-⑥)", () => {
    mockUseAdminOrders.mockReturnValue({ data: [order()], isLoading: false });
    renderPage();
    expect(screen.getByTestId("orders-csv-button")).toBeInTheDocument();
  });

  it("검색어를 입력하면 주소/공급업체/차량번호로 목록을 좁힌다 (06 E10-①)", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [
        order({ id: "a", supplierName: "행복식당", pickupAddress: "서울 강서구" }),
        order({
          id: "b",
          supplierName: "김밥천국",
          pickupAddress: "부산 해운대구",
          riderId: "r-1",
          riderName: "12가3456",
        }),
      ],
      isLoading: false,
    });
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
    mockUseAdminOrders.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    fireEvent.change(screen.getByTestId("orders-date-from"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByTestId("orders-date-to"), { target: { value: "2026-07-08" } });
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL", "2026-07-01", "2026-07-08");
  });

  it("CSV 내보내기는 검색으로 좁혀진 목록만 담는다 (06 E10-①)", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [order({ id: "a", supplierName: "행복식당" }), order({ id: "b", supplierName: "김밥천국" })],
      isLoading: false,
    });
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
    mockUseAdminOrders.mockReturnValue({
      data: [
        // 진입한 지 오래된(2020년) ARRIVED → 24h+ 체류 배지
        order({ id: "stale", status: "ARRIVED", arrivedAt: "2020-01-01T00:00:00.000Z" }),
        // 방금 진입한 ARRIVED → 배지 없음
        order({ id: "fresh", status: "ARRIVED", arrivedAt: new Date().toISOString() }),
      ],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("arrived-stale-badge-stale")).toBeInTheDocument();
    expect(screen.queryByTestId("arrived-stale-badge-fresh")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-row-stale-stale")).toBeInTheDocument();
  });
});

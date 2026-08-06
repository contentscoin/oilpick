import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraceabilityPage } from "./TraceabilityPage";
import type { BarcodeSummaryRow, BarcodeTraceRow } from "../hooks/useTraceability";

/**
 * [19 T7] 유통이력 화면 — 바코드 목록·검색·이력 타임라인.
 * 고정하는 계약: ① 목록 렌더 + 재사용(2회 이상) 배지 ② [이력 보기] → 회차 역순 타임라인
 * ③ 회차별 매장·라이더·좌상·정산 표기 ④ 주문 축 진입(?order=)에서 바코드 칩 노출
 * ⑤ 조회 전용 — 상태 전이 버튼이 없다(절대 규칙 2).
 */
const { mockSummaries, mockTrace, mockOrderBarcodes } = vi.hoisted(() => ({
  mockSummaries: vi.fn(),
  mockTrace: vi.fn(),
  mockOrderBarcodes: vi.fn(),
}));
// 훅 모듈 전체를 대체한다 — importOriginal을 쓰면 실제 supabaseClient가 생성돼(env 없음) 스위트가 죽는다.
vi.mock("../hooks/useTraceability", () => ({
  TRACE_PAGE_SIZE: 50,
  useBarcodeSummaries: (...args: unknown[]) => mockSummaries(...args),
  useBarcodeTrace: (...args: unknown[]) => mockTrace(...args),
  useOrderBarcodes: (...args: unknown[]) => mockOrderBarcodes(...args),
}));

function summary(overrides: Partial<BarcodeSummaryRow> = {}): BarcodeSummaryRow {
  return {
    barcode: "BC-001",
    pickupCount: 2,
    orderCount: 2,
    riderCount: 1,
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-08-05T00:00:00.000Z",
    lastOrderId: "order-2",
    lastRiderId: "rider-1",
    ...overrides,
  };
}

function traceRow(overrides: Partial<BarcodeTraceRow> = {}): BarcodeTraceRow {
  return {
    barcode: "BC-001",
    itemId: 1,
    orderId: "order-1",
    riderId: "rider-1",
    riderName: "김라이더",
    vehicleNumber: "12가3456",
    supplierId: "sup-1",
    storeName: "김밥천국 화곡점",
    pickupAddress: "서울 강서구 화곡로 1",
    dealerId: "dealer-1",
    dealerName: "좌상갑",
    orderStatus: "COMPLETED",
    orderKind: null,
    measuredKg: 20,
    finalKg: 20,
    payoutMethod: "CASH",
    cashPaidAmount: 18000,
    purchaseAmount: null,
    netAmount: 18000,
    dealerSettlementId: null,
    settlementStatus: null,
    photoUrl: null,
    geoLat: 37.5,
    geoLng: 127.0,
    capturedAt: "2026-07-01T00:00:00.000Z",
    recordedAt: "2026-07-01T00:00:00.000Z",
    seenAt: "2026-07-01T00:00:00.000Z",
    completedAt: "2026-07-01T01:00:00.000Z",
    ...overrides,
  };
}

function renderPage(initialPath = "/traceability") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TraceabilityPage />
    </MemoryRouter>,
  );
}

describe("유통이력 목록 (19 T7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSummaries.mockReturnValue({ data: { rows: [summary()], hasNextPage: false }, isLoading: false, isError: false, refetch: vi.fn() });
    mockTrace.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mockOrderBarcodes.mockReturnValue({ data: [] });
  });

  it("바코드 목록을 렌더하고 2회 이상 회수된 바코드에 재사용 배지를 단다", () => {
    renderPage();
    expect(screen.getByTestId("trace-row-BC-001")).toHaveTextContent("BC-001");
    expect(screen.getByTestId("trace-row-BC-001")).toHaveTextContent("재사용");
  });

  it("1회만 회수된 바코드에는 재사용 배지를 달지 않는다", () => {
    mockSummaries.mockReturnValue({
      data: { rows: [summary({ barcode: "BC-9", pickupCount: 1, orderCount: 1 })], hasNextPage: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId("trace-row-BC-9")).not.toHaveTextContent("재사용");
  });

  it("검색어를 입력하면 훅에 그대로 전달한다(서버 ilike — 페이지 밖 바코드까지 닿아야 한다)", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("trace-search-input"), { target: { value: "BC-0" } });
    expect(mockSummaries).toHaveBeenLastCalledWith("BC-0", "", "", 0);
  });

  it("비어 있으면 라이더 등록 안내를 보여준다", () => {
    mockSummaries.mockReturnValue({ data: { rows: [], hasNextPage: false }, isLoading: false, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText(/아직 등록된 바코드가 없어요/)).toBeInTheDocument();
  });
});

describe("유통이력 상세 타임라인 (19 T7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSummaries.mockReturnValue({ data: { rows: [summary()], hasNextPage: false }, isLoading: false, isError: false, refetch: vi.fn() });
    mockOrderBarcodes.mockReturnValue({ data: [] });
    mockTrace.mockReturnValue({
      data: [
        traceRow({ itemId: 2, orderId: "order-2", storeName: "치킨나라 등촌점", seenAt: "2026-08-05T00:00:00.000Z" }),
        traceRow({ itemId: 1 }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("[이력 보기]를 누르면 회차 역순 타임라인이 열린다(최신이 큰 회차)", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("trace-open-BC-001"));
    const timeline = screen.getByTestId("trace-timeline");
    expect(timeline).toBeInTheDocument();
    // 최신(order-2)이 2회차, 과거(order-1)가 1회차.
    expect(screen.getByTestId("trace-event-2")).toHaveTextContent("2회차");
    expect(screen.getByTestId("trace-event-1")).toHaveTextContent("1회차");
  });

  it("회차마다 매장·라이더·좌상·정산 상태를 표기한다(데이터 연결값)", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("trace-open-BC-001"));
    const event = screen.getByTestId("trace-event-1");
    expect(event).toHaveTextContent("김밥천국 화곡점");
    expect(event).toHaveTextContent("김라이더");
    expect(event).toHaveTextContent("12가3456");
    expect(event).toHaveTextContent("좌상갑");
    expect(event).toHaveTextContent("미정산");
  });

  it("주문 상세·GPS 링크를 제공하되 상태 전이 버튼은 두지 않는다(조회 전용 — 절대 규칙 2)", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("trace-open-BC-001"));
    expect(screen.getByTestId("trace-order-link-1")).toHaveAttribute("href", "/orders?order=order-1");
    expect(screen.getByTestId("trace-geo-link-1")).toBeInTheDocument();
    expect(screen.queryByText("주문 취소")).not.toBeInTheDocument();
    expect(screen.queryByText("강제 완결")).not.toBeInTheDocument();
  });
});

describe("주문 축 진입 (19 T7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSummaries.mockReturnValue({ data: { rows: [], hasNextPage: false }, isLoading: false, isError: false, refetch: vi.fn() });
    mockTrace.mockReturnValue({ data: [traceRow()], isLoading: false, isError: false, refetch: vi.fn() });
    mockOrderBarcodes.mockReturnValue({ data: [traceRow(), traceRow({ itemId: 3, barcode: "BC-002" })] });
  });

  it("?order=로 들어오면 그 주문의 바코드 칩을 보여준다", () => {
    renderPage("/traceability?order=order-1");
    expect(screen.getByTestId("trace-order-context")).toBeInTheDocument();
    expect(screen.getByTestId("trace-order-barcode-BC-001")).toBeInTheDocument();
    expect(screen.getByTestId("trace-order-barcode-BC-002")).toBeInTheDocument();
  });
});

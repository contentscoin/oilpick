import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryPage } from "./HistoryPage";

const { mockUseSession, mockUseRunHistory, mockUseMonthlyPickupStats } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRunHistory: vi.fn(),
  mockUseMonthlyPickupStats: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useRunHistory", () => ({ useRunHistory: mockUseRunHistory }));
vi.mock("../hooks/useTodayStats", () => ({ useMonthlyPickupStats: mockUseMonthlyPickupStats }));

const completedItem = {
  id: "order-1",
  status: "COMPLETED",
  pickupAddress: "서울 강남구 역삼로 111",
  requestedKg: 30,
  finalKg: 29.5,
  cashPaidAmount: 20650,
  couponCost: 1,
  createdAt: "2026-07-02T00:00:00Z",
};

const cancelledItem = {
  id: "order-2",
  status: "CANCELLED",
  pickupAddress: "서울 마포구 월드컵로 22",
  requestedKg: 20,
  finalKg: null,
  cashPaidAmount: null,
  couponCost: null,
  createdAt: "2026-07-01T00:00:00Z",
};

describe("HistoryPage — 운행 이력(06 E9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
    mockUseMonthlyPickupStats.mockReturnValue({
      data: { count: 12, kg: 340.5, cash: 480000 },
      isLoading: false,
    });
  });

  it("이번 달 합계 헤더(건수·kg·현금 지급 총액)를 렌더한다", () => {
    mockUseRunHistory.mockReturnValue({ data: { items: [], hasNextPage: false }, isLoading: false });
    render(<HistoryPage />);

    const summary = within(screen.getByTestId("run-history-month-summary"));
    expect(summary.getByText("12건")).toBeInTheDocument();
    expect(summary.getByText("340.5kg")).toBeInTheDocument();
    expect(summary.getByText("480,000원")).toBeInTheDocument();
  });

  it("완료/취소 항목을 날짜·주소·kg·현금·쿠폰·상태 뱃지로 렌더한다(수거비 표기 없음 — 07 D1)", () => {
    mockUseRunHistory.mockReturnValue({
      data: { items: [completedItem, cancelledItem], hasNextPage: false },
      isLoading: false,
    });
    render(<HistoryPage />);

    const items = screen.getAllByTestId("run-history-item");
    expect(items).toHaveLength(2);

    // 완료 항목: 주소 + 확정 무게 + 현장 지급 현금 + 쿠폰 소진 + "완료" 뱃지.
    const completed = within(items[0]!);
    expect(completed.getByText("서울 강남구 역삼로 111")).toBeInTheDocument();
    expect(completed.getByText("29.5kg")).toBeInTheDocument();
    expect(completed.getByText("20,650원")).toBeInTheDocument();
    expect(completed.getByText(/쿠폰 1장/)).toBeInTheDocument();
    expect(completed.getByTestId("status-badge")).toHaveTextContent("완료");

    // 취소 항목: kg/현금/쿠폰 없이 주소 + "취소됨" 뱃지만.
    const cancelled = within(items[1]!);
    expect(cancelled.getByText("서울 마포구 월드컵로 22")).toBeInTheDocument();
    expect(cancelled.getByTestId("status-badge")).toHaveTextContent("취소됨");
    expect(cancelled.queryByText(/원$/)).not.toBeInTheDocument();

    // ⚠️ 구모델 수거비는 어디에도 표기하지 않는다(07 D1).
    expect(screen.queryByText(/수거비/)).not.toBeInTheDocument();
  });

  it("운행 0건이면 EmptyState를 보여준다", () => {
    mockUseRunHistory.mockReturnValue({ data: { items: [], hasNextPage: false }, isLoading: false });
    render(<HistoryPage />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("운행 이력이 없어요")).toBeInTheDocument();
  });

  it("쿼리 실패 시 빈 상태 대신 에러 상태 + 재시도 버튼을 렌더한다", () => {
    const refetch = vi.fn();
    mockUseRunHistory.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<HistoryPage />);
    const error = screen.getByTestId("query-error");
    expect(error).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText("운행 이력이 없어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("첫 페이지에서 이전은 비활성, 다음 클릭 시 다음 페이지를 조회한다", () => {
    mockUseRunHistory.mockReturnValue({
      data: { items: [completedItem], hasNextPage: true },
      isLoading: false,
    });
    render(<HistoryPage />);

    expect(screen.getByTestId("run-history-prev-page")).toBeDisabled();
    const next = screen.getByTestId("run-history-next-page");
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    expect(mockUseRunHistory).toHaveBeenLastCalledWith("rider-1", 1);
  });
});

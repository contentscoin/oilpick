import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EarningsPage } from "./EarningsPage";

const { mockUseSession, mockUseMonthlyPickupStats } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseMonthlyPickupStats: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useTodayStats", () => ({ useMonthlyPickupStats: mockUseMonthlyPickupStats }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/earnings"]}>
      <Routes>
        <Route path="/earnings" element={<EarningsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseMonthlyPickupStats.mockReturnValue({
    data: { count: 4, kg: 105, cash: 64000, point: 10500, cashCount: 3, pointCount: 1 },
    isLoading: false,
  });
});

describe("EarningsPage → 수거 실적(08 G6-④, 수단 분리)", () => {
  it("이번 달 현금/포인트 지급 분리 히어로(건수 병기) + 건수/kg 카드", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "수거 실적" })).toBeInTheDocument();
    expect(screen.getByTestId("monthly-cash-amount")).toHaveTextContent("64,000원");
    expect(screen.getByTestId("monthly-point-amount")).toHaveTextContent("10,500P");
    expect(screen.getByTestId("monthly-cash")).toHaveTextContent("현금 지급 · 3건");
    expect(screen.getByTestId("monthly-cash")).toHaveTextContent("포인트 지급 · 1건");
    expect(screen.getByTestId("monthly-count")).toHaveTextContent("4건");
    expect(screen.getByTestId("monthly-kg")).toHaveTextContent("105.0kg");
  });

  it("쿠폰 요약·충전 링크·포인트 잔액/출금 UI가 없다(08 P1·P5)", () => {
    renderPage();
    expect(screen.queryByTestId("coupon-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-ledger-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-charge-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("withdraw-request-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-card")).not.toBeInTheDocument();
  });

  it("로딩 중에는 스켈레톤을 렌더한다", () => {
    mockUseMonthlyPickupStats.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("stats-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("monthly-cash")).not.toBeInTheDocument();
  });
});

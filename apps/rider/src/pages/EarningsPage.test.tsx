import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EarningsPage } from "./EarningsPage";

const { mockUseSession, mockUseMonthlyPickupStats, mockUseCouponLedger } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseMonthlyPickupStats: vi.fn(),
  mockUseCouponLedger: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useTodayStats", () => ({ useMonthlyPickupStats: mockUseMonthlyPickupStats }));
vi.mock("../hooks/useCoupons", () => ({ useCouponLedger: mockUseCouponLedger }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/earnings"]}>
      <Routes>
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/coupons" element={<div>쿠폰 내역 화면</div>} />
        <Route path="/coupons/purchase" element={<div>쿠폰 충전 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseMonthlyPickupStats.mockReturnValue({ data: { count: 3, kg: 90, cash: 64000 }, isLoading: false });
  const now = new Date();
  const inMonth = new Date(now.getFullYear(), now.getMonth(), 2, 10).toISOString();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10).toISOString();
  mockUseCouponLedger.mockReturnValue({
    data: [
      { id: 1, entryType: "CHARGE", amount: 30, createdAt: inMonth },
      { id: 2, entryType: "CONSUME", amount: -1, createdAt: inMonth },
      { id: 3, entryType: "CONSUME", amount: -1, createdAt: lastMonth }, // 지난달 — 제외.
    ],
  });
});

describe("EarningsPage → 수거 실적(07 F6-⑤)", () => {
  it("이번 달 현금/건수/kg 집계 + 포인트/출금 UI 제거", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "수거 실적" })).toBeInTheDocument();
    expect(screen.getByTestId("monthly-cash")).toHaveTextContent("64,000원");
    expect(screen.getByTestId("monthly-count")).toHaveTextContent("3건");
    expect(screen.getByTestId("monthly-kg")).toHaveTextContent("90.0kg");
    // 포인트 잔액/출금 UI가 없다.
    expect(screen.queryByTestId("withdraw-request-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-card")).not.toBeInTheDocument();
  });

  it("이번 달 쿠폰 요약(CONSUME/CHARGE 합, 지난달 제외)", () => {
    renderPage();
    const summary = screen.getByTestId("coupon-summary");
    expect(summary).toHaveTextContent("충전");
    expect(summary).toHaveTextContent("30장");
    expect(summary).toHaveTextContent("소진");
    expect(summary).toHaveTextContent("1장"); // 지난달 CONSUME은 제외.
  });

  it("[쿠폰 내역]/[충전] 링크", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("coupon-ledger-link"));
    expect(screen.getByText("쿠폰 내역 화면")).toBeInTheDocument();
  });

  it("[충전] 링크는 결제 화면으로", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("coupon-charge-link"));
    expect(screen.getByText("쿠폰 충전 화면")).toBeInTheDocument();
  });
});

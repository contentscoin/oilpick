import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallHomePage } from "./CallHomePage";

const {
  mockUseSession,
  mockUseRiderProfile,
  mockUseOpenCalls,
  mockUseCouponBalance,
  mockUseTodayStats,
  mockUseGeolocation,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRiderProfile: vi.fn(),
  mockUseOpenCalls: vi.fn(),
  mockUseCouponBalance: vi.fn(),
  mockUseTodayStats: vi.fn(),
  mockUseGeolocation: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useRiderProfile", () => ({ useRiderProfile: mockUseRiderProfile }));
vi.mock("../hooks/useOpenCalls", () => ({ useOpenCalls: mockUseOpenCalls }));
vi.mock("../hooks/useCoupons", () => ({ useCouponBalance: mockUseCouponBalance }));
vi.mock("../hooks/useTodayStats", () => ({ useTodayStats: mockUseTodayStats }));
vi.mock("../hooks/useGeolocation", () => ({ useGeolocation: mockUseGeolocation }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: vi.fn() } }));

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<CallHomePage />} />
        <Route path="/coupons" element={<div>쿠폰 내역 화면</div>} />
        <Route path="/coupons/purchase" element={<div>쿠폰 충전 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseRiderProfile.mockReturnValue({ data: { isOnline: true, verifyStatus: "APPROVED" } });
  mockUseOpenCalls.mockReturnValue({ data: [], isLoading: false });
  mockUseCouponBalance.mockReturnValue({ data: 12 });
  mockUseTodayStats.mockReturnValue({
    data: { completedCount: 2, collectedKg: 60, cashPaid: 96000, consumedCoupons: 3 },
  });
  mockUseGeolocation.mockReturnValue(null);
});

describe("CallHomePage — 쿠폰 잔액 카드(07 F5-①)", () => {
  it("renders coupon balance hero (보유 수거쿠폰 N장)", () => {
    renderHome();
    expect(screen.getByText("보유 수거쿠폰")).toBeInTheDocument();
    expect(screen.getByText("12장")).toBeInTheDocument();
  });

  it("[충전하기] navigates to /coupons/purchase", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("coupon-charge-button"));
    expect(screen.getByText("쿠폰 충전 화면")).toBeInTheDocument();
  });

  it("card tap navigates to /coupons (ledger)", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("point-balance-card"));
    expect(screen.getByText("쿠폰 내역 화면")).toBeInTheDocument();
  });
});

describe("CallHomePage — 오늘 실적(07 F6-⑥)", () => {
  it("수거 kg / 지급 현금 / 소진 쿠폰(현금 매입 기준)", () => {
    renderHome();
    expect(screen.getByTestId("today-collected-kg")).toHaveTextContent("60.0kg");
    expect(screen.getByTestId("today-cash")).toHaveTextContent("96,000원");
    expect(screen.getByTestId("today-coupons")).toHaveTextContent("오늘 소진 쿠폰 3장");
    // 구모델 포인트 표기 없음.
    expect(screen.queryByText("오늘 확정 포인트")).not.toBeInTheDocument();
  });
});

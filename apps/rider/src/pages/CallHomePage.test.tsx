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
  mockUseTodayStats.mockReturnValue({ data: { completedCount: 0, earnedPoint: 0 } });
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

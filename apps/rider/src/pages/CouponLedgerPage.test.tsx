import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponLedgerPage } from "./CouponLedgerPage";

// [17 Q3] a4b4fdd^ 원형 테스트 복원 + 잔액 히어로(17 C6 — 내역 화면 승격) 케이스 추가.
const { mockUseSession, mockUseCouponBalance, mockUseCouponLedger } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseCouponBalance: vi.fn(),
  mockUseCouponLedger: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useCoupons", () => ({
  useCouponBalance: mockUseCouponBalance,
  useCouponLedger: mockUseCouponLedger,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/coupons"]}>
      <Routes>
        <Route path="/coupons" element={<CouponLedgerPage />} />
        <Route path="/coupons/purchase" element={<div>충전 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseCouponBalance.mockReturnValue({ data: 7, isLoading: false });
  mockUseCouponLedger.mockReturnValue({ data: [], isLoading: false });
});

describe("CouponLedgerPage — 잔액 히어로(17 C6)", () => {
  it("보유 수거쿠폰 N장 히어로 + [충전하기] → 충전 화면", () => {
    renderPage();
    const card = screen.getByTestId("point-balance-card");
    expect(card).toHaveTextContent("보유 수거쿠폰");
    expect(card).toHaveTextContent("7장");
    fireEvent.click(screen.getByTestId("coupon-charge-button"));
    expect(screen.getByText("충전 화면")).toBeInTheDocument();
  });

  it("잔액 로딩 중에는 0장 플래시 대신 스켈레톤", () => {
    mockUseCouponBalance.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("coupon-balance-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-card")).not.toBeInTheDocument();
  });
});

describe("CouponLedgerPage — 내역", () => {
  it("renders coupon ledger rows with all 4 entry_type labels + 장 amounts", () => {
    mockUseCouponLedger.mockReturnValue({
      data: [
        { id: 1, entryType: "CHARGE", amount: 30, createdAt: "2026-08-05T00:00:00Z" },
        { id: 2, entryType: "CONSUME", amount: -1, createdAt: "2026-08-05T01:00:00Z" },
        { id: 3, entryType: "REFUND", amount: 1, createdAt: "2026-08-05T02:00:00Z" },
        { id: 4, entryType: "ADJUST", amount: 20, memo: "데모 선지급", createdAt: "2026-08-05T03:00:00Z" },
      ],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("충전")).toBeInTheDocument();
    expect(screen.getByText("+30장")).toBeInTheDocument();
    expect(screen.getByText("콜 배정")).toBeInTheDocument();
    expect(screen.getByText("-1장")).toBeInTheDocument();
    expect(screen.getByText("환급")).toBeInTheDocument();
    expect(screen.getByText("조정")).toBeInTheDocument();
    expect(screen.getByText("데모 선지급")).toBeInTheDocument();
  });

  it("shows empty state when there is no history", () => {
    mockUseCouponLedger.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText("아직 쿠폰 내역이 없어요")).toBeInTheDocument();
  });

  it("shows an error state (not the empty state) with a retry button when the query fails", () => {
    const refetch = vi.fn();
    mockUseCouponLedger.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPage();
    const error = screen.getByTestId("query-error");
    expect(error).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText("아직 쿠폰 내역이 없어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalled();
  });
});

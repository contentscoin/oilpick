import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponLedgerPage } from "./CouponLedgerPage";

const { mockUseSession, mockUseCouponLedger } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseCouponLedger: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useCoupons", () => ({ useCouponLedger: mockUseCouponLedger }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/coupons"]}>
      <CouponLedgerPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
});

describe("CouponLedgerPage", () => {
  it("renders coupon ledger rows with all 4 entry_type labels + 장 amounts", () => {
    mockUseCouponLedger.mockReturnValue({
      data: [
        { id: 1, entryType: "CHARGE", amount: 30, createdAt: "2026-07-09T00:00:00Z" },
        { id: 2, entryType: "CONSUME", amount: -1, createdAt: "2026-07-09T01:00:00Z" },
        { id: 3, entryType: "REFUND", amount: 1, createdAt: "2026-07-09T02:00:00Z" },
        { id: 4, entryType: "ADJUST", amount: 20, memo: "데모 선지급", createdAt: "2026-07-09T03:00:00Z" },
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
});

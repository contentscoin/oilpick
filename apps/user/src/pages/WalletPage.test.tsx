import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPage } from "./WalletPage";

const { mockUseSession, mockUseMonthlyCashReceipt, mockUseCashReceipts } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseMonthlyCashReceipt: vi.fn(),
  mockUseCashReceipts: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useCashReceipts", () => ({
  useMonthlyCashReceipt: mockUseMonthlyCashReceipt,
  useCashReceipts: mockUseCashReceipts,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/wallet"]}>
      <WalletPage />
    </MemoryRouter>,
  );
}

describe("WalletPage (수령 이력)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUseMonthlyCashReceipt.mockReturnValue({ data: { count: 3, cash: 96000 }, isLoading: false });
    mockUseCashReceipts.mockReturnValue({ data: [], isLoading: false });
  });

  it("shows this month's total cash received", () => {
    renderPage();
    const total = screen.getByTestId("receipts-month-total");
    expect(total).toHaveTextContent("이번 달 수령");
    expect(total).toHaveTextContent("96,000원");
    expect(total).toHaveTextContent("수거 3건");
  });

  it("renders a per-order cash receipt list (date / kg / ₩N)", () => {
    mockUseCashReceipts.mockReturnValue({
      data: [
        { id: "r1", amount: 31500, finalKg: 31.5, receivedAt: "2026-07-08T05:00:00Z" },
        { id: "r2", amount: 21000, finalKg: 15, receivedAt: "2026-07-05T05:00:00Z" },
      ],
      isLoading: false,
    });
    renderPage();
    const items = screen.getAllByTestId("receipt-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("31,500원");
    expect(items[0]).toHaveTextContent("31.5kg");
  });

  it("shows an empty state when there are no receipts", () => {
    renderPage();
    expect(screen.queryByTestId("receipts-list")).not.toBeInTheDocument();
    expect(screen.getByText("아직 수령 내역이 없어요")).toBeInTheDocument();
  });
});

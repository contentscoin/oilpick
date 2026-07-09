import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersHistoryPage } from "./OrdersHistoryPage";

const { mockUseSession, mockUseOrderHistory } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrderHistory: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useOrderHistory", () => ({ useOrderHistory: mockUseOrderHistory }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/orders"]}>
      <Routes>
        <Route path="/orders" element={<OrdersHistoryPage />} />
        <Route path="/orders/:id" element={<div>ORDER_DETAIL_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrdersHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
  });

  it("shows an empty state when there is no history", () => {
    mockUseOrderHistory.mockReturnValue({ data: { items: [], hasNextPage: false }, isLoading: false });
    renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("shows the received cash for a new-model completed order and legacy points for legacy orders", () => {
    mockUseOrderHistory.mockReturnValue({
      data: {
        items: [
          // 신모델 완료 주문: 현장 수령 현금.
          { id: "order-1", status: "COMPLETED", requestedKg: 30, finalKg: 29.5, supplierPoint: null, cashPaidAmount: 20650, createdAt: "2026-07-02T00:00:00Z" },
          // 레거시 완료 주문: 구모델 EARN 포인트(레거시 렌더 분기).
          { id: "order-2", status: "COMPLETED", requestedKg: 30, finalKg: 29.5, supplierPoint: 18000, cashPaidAmount: null, createdAt: "2026-07-01T00:00:00Z" },
        ],
        hasNextPage: false,
      },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("orders-history-list")).toBeInTheDocument();
    expect(screen.getByText("20,650원")).toBeInTheDocument();
    expect(screen.getByText("18,000P")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("orders-history-item")[0]!);
    expect(screen.getByText("ORDER_DETAIL_PAGE")).toBeInTheDocument();
  });

  it("disables the prev button on the first page and enables next when hasNextPage", () => {
    mockUseOrderHistory.mockReturnValue({
      data: {
        items: [{ id: "order-1", status: "COMPLETED", requestedKg: 30, finalKg: 29.5, supplierPoint: 20650, createdAt: "2026-07-01T00:00:00Z" }],
        hasNextPage: true,
      },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("orders-history-prev-page")).toBeDisabled();
    expect(screen.getByTestId("orders-history-next-page")).not.toBeDisabled();
  });
});

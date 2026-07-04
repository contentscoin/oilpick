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

  it("renders order items and navigates to the detail page on click", () => {
    mockUseOrderHistory.mockReturnValue({
      data: {
        items: [
          { id: "order-1", status: "COMPLETED", requestedKg: 30, finalKg: 29.5, supplierPoint: 20650, createdAt: "2026-07-01T00:00:00Z" },
        ],
        hasNextPage: false,
      },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("orders-history-list")).toBeInTheDocument();
    expect(screen.getByText("20,650P")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("orders-history-item"));
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

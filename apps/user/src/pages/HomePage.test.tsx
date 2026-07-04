import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

const { mockUseSession, mockUseLatestPriceTick, mockUsePriceTicks, mockUseActiveOrder } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseLatestPriceTick: vi.fn(),
  mockUsePriceTicks: vi.fn(),
  mockUseActiveOrder: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/usePriceTicks", () => ({
  useLatestPriceTick: mockUseLatestPriceTick,
  usePriceTicks: mockUsePriceTicks,
}));
vi.mock("../hooks/useActiveOrder", () => ({ useActiveOrder: mockUseActiveOrder }));

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUsePriceTicks.mockReturnValue({ data: [{ id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" }] });
    mockUseActiveOrder.mockReturnValue({ data: null });
  });

  it("shows the price card and estimated point once price data loads", () => {
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" }, isLoading: false });
    renderHome();
    expect(screen.getByTestId("price-card")).toBeInTheDocument();
    // 기본 1통 = 15kg, 700원/kg → 10,500P
    expect(screen.getByTestId("estimated-point")).toHaveTextContent("10,500P");
  });

  it("shows a skeleton while price is loading", () => {
    mockUseLatestPriceTick.mockReturnValue({ data: undefined, isLoading: true });
    renderHome();
    expect(screen.getByTestId("price-card-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("price-card")).not.toBeInTheDocument();
  });

  it("updates estimated point when qty stepper increments", () => {
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" }, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTestId("qty-stepper-increment"));
    // 2통 = 30kg, 700원/kg → 21,000P
    expect(screen.getByTestId("estimated-point")).toHaveTextContent("21,000P");
  });

  it("shows the pinned active order card when there is an in-progress order", () => {
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" }, isLoading: false });
    mockUseActiveOrder.mockReturnValue({
      data: { id: "order-1", status: "ACCEPTED", requestedKg: 30, snapshotPricePerKg: 700, createdAt: "2026-07-01T00:00:00Z" },
    });
    renderHome();
    expect(screen.getByTestId("active-order-card")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("라이더 배정");
  });

  it("does not show the active order card when there is none", () => {
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" }, isLoading: false });
    renderHome();
    expect(screen.queryByTestId("active-order-card")).not.toBeInTheDocument();
  });
});

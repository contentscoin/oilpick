import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricePage } from "./PricePage";

const { mockUsePriceTicks } = vi.hoisted(() => ({ mockUsePriceTicks: vi.fn() }));
vi.mock("../hooks/usePriceTicks", () => ({ usePriceTicks: mockUsePriceTicks }));

const SAMPLE_TICKS = [
  { id: 3, pricePerKg: 720, riderFee: 5000, effectiveAt: "2026-07-03T00:00:00Z" },
  { id: 2, pricePerKg: 710, riderFee: 5000, effectiveAt: "2026-07-02T00:00:00Z" },
  { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/price"]}>
      <PricePage />
    </MemoryRouter>,
  );
}

describe("PricePage", () => {
  beforeEach(() => {
    mockUsePriceTicks.mockReturnValue({ data: SAMPLE_TICKS, isLoading: false });
  });

  it("renders the chart and history table with most recent tick first", () => {
    renderPage();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    const table = screen.getByTestId("price-history-table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("720");
  });

  it("shows a skeleton while loading", () => {
    mockUsePriceTicks.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("price-chart-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });

  it("switches range tabs", () => {
    renderPage();
    expect(screen.getByTestId("price-range-tab-day")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("price-range-tab-week"));
    expect(screen.getByTestId("price-range-tab-week")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("price-range-tab-day")).toHaveAttribute("aria-pressed", "false");
  });
});

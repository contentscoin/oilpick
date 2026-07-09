import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricePage } from "./PricePage";

const { mockUsePriceTicksSince } = vi.hoisted(() => ({ mockUsePriceTicksSince: vi.fn() }));
vi.mock("../hooks/usePriceTicks", () => ({ usePriceTicksSince: mockUsePriceTicksSince }));

// 3일치 tick — resampleDaily로 3점 일별 시계열이 되어 PriceChart가 렌더된다.
const SAMPLE_TICKS = [
  { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-06T03:00:00Z" },
  { id: 2, pricePerKg: 710, riderFee: 5000, effectiveAt: "2026-07-07T03:00:00Z" },
  { id: 3, pricePerKg: 720, riderFee: 5000, effectiveAt: "2026-07-08T03:00:00Z" },
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
    vi.clearAllMocks();
    mockUsePriceTicksSince.mockReturnValue({ data: SAMPLE_TICKS, isLoading: false });
  });

  it("renders the same PriceChart system as the home hero (no recharts)", () => {
    renderPage();
    expect(screen.getByTestId("price-hero")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
  });

  it("renders the history table with the most recent tick first (매입가만, 수거비 열 없음)", () => {
    renderPage();
    const table = screen.getByTestId("price-history-table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("720");
    // 수거비(P) 열은 07 F8에서 제거(rider_fee 소멸).
    expect(table.textContent).not.toContain("수거비");
  });

  it("shows a skeleton while loading", () => {
    mockUsePriceTicksSince.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("price-chart-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });

  it("switches range tabs (7/30/90)", () => {
    renderPage();
    expect(screen.getByTestId("segment-option-30")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("segment-option-90"));
    expect(screen.getByTestId("segment-option-90")).toHaveAttribute("aria-checked", "true");
    expect(mockUsePriceTicksSince).toHaveBeenCalledWith(90);
  });

  it("shows the empty-state caption when fewer than 2 daily points", () => {
    mockUsePriceTicksSince.mockReturnValue({
      data: [{ id: 9, pricePerKg: 800, riderFee: 0, effectiveAt: "2026-07-08T03:00:00Z" }],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("price-empty-caption")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });
});

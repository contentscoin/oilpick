import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceStatsRow } from "./PriceStatsRow";
import type { PriceChartPoint } from "./PriceChart";
import { colors } from "../tokens";

const DATA: PriceChartPoint[] = [
  { date: "2026-07-06", price: 700 },
  { date: "2026-07-07", price: 760 },
  { date: "2026-07-08", price: 640 },
  { date: "2026-07-09", price: 720 },
];

describe("PriceStatsRow", () => {
  it("기간 최고/최저/평균/등락률을 렌더한다", () => {
    render(<PriceStatsRow data={DATA} />);
    expect(screen.getByTestId("price-stats-row")).toBeInTheDocument();
    expect(screen.getByText("기간 최고")).toBeInTheDocument();
    expect(screen.getByText("760원")).toBeInTheDocument();
    expect(screen.getByText("640원")).toBeInTheDocument();
    // 평균 = (700+760+640+720)/4 = 705
    expect(screen.getByText("705원")).toBeInTheDocument();
    // 등락 = (720-700)/700 = +2.9%
    expect(screen.getByText("+2.9%")).toBeInTheDocument();
  });

  it("상승 기간 등락률은 up 토큰 색", () => {
    render(<PriceStatsRow data={DATA} />);
    const change = screen.getByText("+2.9%");
    expect(change).toHaveStyle({ color: colors.up });
  });

  it("하락 기간은 -% 와 down 토큰 색", () => {
    render(
      <PriceStatsRow
        data={[
          { date: "2026-07-06", price: 800 },
          { date: "2026-07-07", price: 720 },
        ]}
      />,
    );
    const change = screen.getByText("-10.0%");
    expect(change).toHaveStyle({ color: colors.down });
  });

  it("2점 미만이면 렌더하지 않는다", () => {
    const { container } = render(<PriceStatsRow data={[{ date: "2026-07-08", price: 700 }]} />);
    expect(container.firstChild).toBeNull();
  });
});

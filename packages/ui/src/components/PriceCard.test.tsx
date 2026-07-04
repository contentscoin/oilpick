import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceCard } from "./PriceCard";

describe("PriceCard", () => {
  it("renders the current price and change amount", () => {
    render(<PriceCard pricePerKg={1200} changeAmount={50} history={[1100, 1150, 1200]} />);
    expect(screen.getByTestId("price-card")).toBeInTheDocument();
    expect(screen.getByText(/1,200원/)).toBeInTheDocument();
    expect(screen.getByTestId("price-card-sparkline")).toBeInTheDocument();
  });

  it("omits the sparkline when history has fewer than 2 points", () => {
    render(<PriceCard pricePerKg={1200} changeAmount={0} history={[1200]} />);
    expect(screen.queryByTestId("price-card-sparkline")).not.toBeInTheDocument();
  });
});

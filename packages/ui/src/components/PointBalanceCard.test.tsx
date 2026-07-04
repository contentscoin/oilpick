import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PointBalanceCard } from "./PointBalanceCard";

describe("PointBalanceCard", () => {
  it("renders available balance prominently", () => {
    render(<PointBalanceCard available={12345} />);
    expect(screen.getByText("12,345P")).toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-held")).not.toBeInTheDocument();
  });

  it("renders held balance as a secondary line when > 0", () => {
    render(<PointBalanceCard available={12345} held={5000} />);
    expect(screen.getByText("지급 확정 대기 5,000P")).toBeInTheDocument();
  });
});

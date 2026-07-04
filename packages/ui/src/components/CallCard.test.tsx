import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallCard } from "./CallCard";

describe("CallCard", () => {
  it("renders distance, estimated kg, and pickup fee", () => {
    render(<CallCard distanceKm={3.2} estimatedKg={45} pickupFee={5000} />);
    expect(screen.getByText(/3\.2km/)).toBeInTheDocument();
    expect(screen.getByText(/45\.0kg/)).toBeInTheDocument();
    expect(screen.getByText(/5,000원/)).toBeInTheDocument();
  });

  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(<CallCard distanceKm={1} estimatedKg={15} pickupFee={3000} onClick={onClick} />);
    screen.getByTestId("call-card").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

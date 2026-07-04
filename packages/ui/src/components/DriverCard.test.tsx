import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriverCard } from "./DriverCard";

describe("DriverCard", () => {
  it("renders name, vehicle number, and verified badge", () => {
    render(<DriverCard name="김철수" vehicleNo="12가 3456" />);
    expect(screen.getByText("김철수")).toBeInTheDocument();
    expect(screen.getByText("12가 3456")).toBeInTheDocument();
    expect(screen.getByTestId("driver-card-verified")).toBeInTheDocument();
  });

  it("renders a tel: call link when phone is provided", () => {
    render(<DriverCard name="김철수" phone="01000000000" />);
    expect(screen.getByTestId("driver-card-call")).toHaveAttribute("href", "tel:01000000000");
  });

  it("omits the verified badge when verified is false", () => {
    render(<DriverCard name="김철수" verified={false} />);
    expect(screen.queryByTestId("driver-card-verified")).not.toBeInTheDocument();
  });
});

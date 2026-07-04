import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QtyStepper } from "./QtyStepper";

describe("QtyStepper", () => {
  it("renders the current quantity and estimated kg", () => {
    render(<QtyStepper value={3} onChange={() => {}} />);
    expect(screen.getByText("3통")).toBeInTheDocument();
    expect(screen.getByTestId("qty-stepper-kg")).toHaveTextContent("45.0kg");
  });

  it("calls onChange with incremented value", () => {
    const onChange = vi.fn();
    render(<QtyStepper value={3} onChange={onChange} />);
    screen.getByTestId("qty-stepper-increment").click();
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderTimeline } from "./OrderTimeline";

describe("OrderTimeline", () => {
  it("renders all happy-path steps", () => {
    render(<OrderTimeline currentStatus="ARRIVED" />);
    expect(screen.getByText("수거 요청됨")).toBeInTheDocument();
    expect(screen.getByText("현장 도착")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
  });

  it("renders a single exceptional step for CANCELLED", () => {
    render(<OrderTimeline currentStatus="CANCELLED" />);
    expect(screen.getByText("취소됨")).toBeInTheDocument();
    expect(screen.queryByText("수거 요청됨")).not.toBeInTheDocument();
  });
});

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

  it("does not render a time column when timestamps is omitted", () => {
    render(<OrderTimeline currentStatus="ARRIVED" />);
    expect(screen.queryByTestId("order-timeline-time-REQUESTED")).not.toBeInTheDocument();
  });

  it("shows per-step times and a dash for steps without a timestamp", () => {
    render(
      <OrderTimeline
        currentStatus="ARRIVED"
        timestamps={{ REQUESTED: "오늘 09:00", ACCEPTED: "오늘 09:05" }}
      />,
    );
    expect(screen.getByTestId("order-timeline-time-REQUESTED")).toHaveTextContent("오늘 09:00");
    expect(screen.getByTestId("order-timeline-time-ACCEPTED")).toHaveTextContent("오늘 09:05");
    // 시각이 없는 미래/미기록 스텝은 "-".
    expect(screen.getByTestId("order-timeline-time-PICKED_UP")).toHaveTextContent("-");
    expect(screen.getByTestId("order-timeline-time-COMPLETED")).toHaveTextContent("-");
  });
});

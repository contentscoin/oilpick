import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderTimeline } from "./OrderTimeline";

describe("OrderTimeline", () => {
  it("renders the 4-step happy path without the legacy PICKED_UP step", () => {
    // 07 F9-⑦: 신 상태머신은 ARRIVED→COMPLETED 직행 — PICKED_UP/DELIVERED 스텝 미표시.
    render(<OrderTimeline currentStatus="ARRIVED" />);
    expect(screen.getByText("수거 요청됨")).toBeInTheDocument();
    expect(screen.getByText("라이더 배정")).toBeInTheDocument();
    expect(screen.getByText("현장 도착")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.queryByText("수거 완료")).not.toBeInTheDocument();
  });

  it("renders the legacy 5-step path when legacy is set", () => {
    render(<OrderTimeline currentStatus="ARRIVED" legacy />);
    // 레거시 경로는 PICKED_UP("수거 완료") 스텝을 포함한다.
    expect(screen.getByText("수거 완료")).toBeInTheDocument();
  });

  it("auto-detects a legacy path when currentStatus is PICKED_UP", () => {
    render(<OrderTimeline currentStatus="PICKED_UP" />);
    expect(screen.getByText("수거 완료")).toBeInTheDocument();
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
    expect(screen.getByTestId("order-timeline-time-ARRIVED")).toHaveTextContent("-");
    expect(screen.getByTestId("order-timeline-time-COMPLETED")).toHaveTextContent("-");
    // 신규 경로에는 PICKED_UP 스텝(시각 컬럼)이 없다.
    expect(screen.queryByTestId("order-timeline-time-PICKED_UP")).not.toBeInTheDocument();
  });
});

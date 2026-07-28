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
    // 도달했는데 시각이 없는 스텝(현재 ARRIVED)은 "-"로 공백을 드러낸다.
    expect(screen.getByTestId("order-timeline-time-ARRIVED")).toHaveTextContent("-");
    // [15] 아직 오지 않은 스텝은 시각 줄 자체를 렌더하지 않는다("예정" pill이 대신 말한다).
    expect(screen.queryByTestId("order-timeline-time-COMPLETED")).not.toBeInTheDocument();
    // 신규 경로에는 PICKED_UP 스텝(시각 컬럼)이 없다.
    expect(screen.queryByTestId("order-timeline-time-PICKED_UP")).not.toBeInTheDocument();
  });

  it("[15] 스텝마다 완료됨/진행 중/예정 상태 pill을 붙인다", () => {
    render(<OrderTimeline currentStatus="ARRIVED" />);
    expect(screen.getByTestId("order-timeline-state-REQUESTED")).toHaveTextContent("완료됨");
    expect(screen.getByTestId("order-timeline-state-ACCEPTED")).toHaveTextContent("완료됨");
    expect(screen.getByTestId("order-timeline-state-ARRIVED")).toHaveTextContent("진행 중");
    expect(screen.getByTestId("order-timeline-state-COMPLETED")).toHaveTextContent("예정");
  });

  it("[15] COMPLETED 주문은 마지막 스텝이 '진행 중'이 아니라 종결이다", () => {
    render(<OrderTimeline currentStatus="COMPLETED" />);
    expect(screen.getByTestId("order-timeline-state-ARRIVED")).toHaveTextContent("완료됨");
    // 도달한 마지막 스텝은 라벨("완료")이 종결을 말하므로 pill을 겹쳐 붙이지 않는다.
    expect(screen.queryByTestId("order-timeline-state-COMPLETED")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-timeline")).not.toHaveTextContent("진행 중");
  });

  it("[15] 레거시 DELIVERED는 PICKED_UP까지 완료로 읽는다", () => {
    // path.indexOf("DELIVERED") === -1이라 예전엔 전 스텝이 미완("예정")으로 보였다.
    render(<OrderTimeline currentStatus="DELIVERED" />);
    expect(screen.getByTestId("order-timeline-state-PICKED_UP")).toHaveTextContent("완료됨");
    expect(screen.getByTestId("order-timeline-state-REQUESTED")).toHaveTextContent("완료됨");
  });
});

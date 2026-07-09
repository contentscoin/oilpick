import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusHeadline } from "./StatusHeadline";

describe("StatusHeadline", () => {
  it("renders a conversational headline and subtitle for the status", () => {
    render(<StatusHeadline status="REQUESTED" />);
    expect(screen.getByText("주변 라이더를 찾고 있어요")).toBeInTheDocument();
    expect(screen.getByTestId("status-headline")).toBeInTheDocument();
  });

  it("renders the cash-based completed headline for COMPLETED (07 F9)", () => {
    render(<StatusHeadline status="COMPLETED" />);
    expect(screen.getByText("수거가 완료됐어요")).toBeInTheDocument();
    expect(screen.getByText("현금 수령이 확인됐어요.")).toBeInTheDocument();
  });

  it("auto-maps the status to a pill label", () => {
    render(<StatusHeadline status="ACCEPTED" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("진행 중");
  });

  it("maps completed/cancelled/disputed/requested statuses to their pills", () => {
    const { rerender } = render(<StatusHeadline status="COMPLETED" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("완료");
    rerender(<StatusHeadline status="CANCELLED" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("취소됨");
    rerender(<StatusHeadline status="DISPUTED" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("확인 중");
    rerender(<StatusHeadline status="REQUESTED" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("요청됨");
  });

  it("overrides the pill label when a pill prop is given", () => {
    render(<StatusHeadline status="ACCEPTED" pill="배정 완료" />);
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("배정 완료");
  });

  it("hides the pill when pill is null", () => {
    render(<StatusHeadline status="ACCEPTED" pill={null} />);
    expect(screen.queryByTestId("status-headline-pill")).not.toBeInTheDocument();
  });

  it("overrides the subtitle when a subtitle prop is given", () => {
    render(<StatusHeadline status="ACCEPTED" subtitle="김민준 라이더가 매장으로 이동 중이에요" />);
    expect(screen.getByText("김민준 라이더가 매장으로 이동 중이에요")).toBeInTheDocument();
    expect(screen.queryByText("곧 라이더가 출발해요.")).not.toBeInTheDocument();
  });
});

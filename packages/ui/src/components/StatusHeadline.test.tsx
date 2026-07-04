import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusHeadline } from "./StatusHeadline";

describe("StatusHeadline", () => {
  it("renders a conversational headline and subtitle for the status", () => {
    render(<StatusHeadline status="REQUESTED" />);
    expect(screen.getByText("주변 라이더를 찾고 있어요")).toBeInTheDocument();
    expect(screen.getByTestId("status-headline")).toBeInTheDocument();
  });

  it("renders the completed headline for COMPLETED", () => {
    render(<StatusHeadline status="COMPLETED" />);
    expect(screen.getByText("배송까지 완료됐어요")).toBeInTheDocument();
  });
});

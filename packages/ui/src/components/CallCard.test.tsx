import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallCard } from "./CallCard";

describe("CallCard", () => {
  it("renders distance, estimated kg, and pickup fee", () => {
    render(<CallCard distanceKm={3.2} estimatedKg={45} pickupFee={5000} />);
    // 리치 레이아웃: 거리 숫자와 단위(km)는 별도 노드로 분리되어 카드 전체 텍스트에 함께 나타난다.
    expect(screen.getByTestId("call-card")).toHaveTextContent("3.2km");
    expect(screen.getByText(/45\.0kg/)).toBeInTheDocument();
    expect(screen.getByText(/5,000원/)).toBeInTheDocument();
  });

  it("renders the address when provided", () => {
    render(
      <CallCard distanceKm={1} estimatedKg={15} pickupFee={3000} address="서울시 강남구 테헤란로 123" />,
    );
    expect(screen.getByText("서울시 강남구 테헤란로 123")).toBeInTheDocument();
  });

  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(<CallCard distanceKm={1} estimatedKg={15} pickupFee={3000} onClick={onClick} />);
    screen.getByTestId("call-card").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

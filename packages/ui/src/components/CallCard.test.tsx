import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallCard } from "./CallCard";

describe("CallCard", () => {
  it("renders distance, estimated kg, and 예상 매입 지급액", () => {
    render(<CallCard distanceKm={3.2} estimatedKg={45} estimatedCash={72000} couponCost={3} />);
    // 리치 레이아웃: 거리 숫자와 단위(km)는 별도 노드로 분리되어 카드 전체 텍스트에 함께 나타난다.
    expect(screen.getByTestId("call-card")).toHaveTextContent("3.2km");
    expect(screen.getByText(/45\.0kg/)).toBeInTheDocument();
    expect(screen.getByTestId("call-card-cash")).toHaveTextContent("72,000원");
    expect(screen.getByText("예상 매입 지급액")).toBeInTheDocument();
  });

  it("[07 F5] shows 쿠폰 N장 소진 chip from coupon_cost", () => {
    render(<CallCard distanceKm={1} estimatedKg={30} estimatedCash={48000} couponCost={2} />);
    expect(screen.getByTestId("call-card-coupon")).toHaveTextContent("쿠폰 2장 소진");
  });

  it("[07 F5] omits coupon chip for legacy orders (couponCost null)", () => {
    render(<CallCard distanceKm={1} estimatedKg={30} estimatedCash={48000} couponCost={null} />);
    expect(screen.queryByTestId("call-card-coupon")).not.toBeInTheDocument();
    // 매입액은 레거시에도 표시.
    expect(screen.getByTestId("call-card-cash")).toHaveTextContent("48,000원");
  });

  it("renders the address when provided", () => {
    render(
      <CallCard
        distanceKm={1}
        estimatedKg={15}
        estimatedCash={24000}
        couponCost={1}
        address="서울시 강남구 테헤란로 123"
      />,
    );
    expect(screen.getByText("서울시 강남구 테헤란로 123")).toBeInTheDocument();
  });

  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(
      <CallCard distanceKm={1} estimatedKg={15} estimatedCash={24000} couponCost={1} onClick={onClick} />,
    );
    screen.getByTestId("call-card").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayoutMethodChip } from "./PayoutMethodChip";

describe("PayoutMethodChip", () => {
  it("CASH → '현금' 라벨", () => {
    render(<PayoutMethodChip method="CASH" />);
    expect(screen.getByTestId("payout-method-chip")).toHaveTextContent("현금");
  });

  it("POINT → '포인트' 라벨", () => {
    render(<PayoutMethodChip method="POINT" />);
    expect(screen.getByTestId("payout-method-chip")).toHaveTextContent("포인트");
  });

  it("method가 null/undefined면 렌더하지 않는다(계량 제출 전·레거시)", () => {
    const { container, rerender } = render(<PayoutMethodChip method={null} />);
    expect(container.firstChild).toBeNull();
    rerender(<PayoutMethodChip method={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

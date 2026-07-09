import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PointBalanceCard, PointHeroAction } from "./PointBalanceCard";

describe("PointBalanceCard", () => {
  it("renders available balance prominently", () => {
    render(<PointBalanceCard available={12345} />);
    expect(screen.getByText("12,345P")).toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-held")).not.toBeInTheDocument();
  });

  it("renders held balance as a secondary line when > 0", () => {
    render(<PointBalanceCard available={12345} held={5000} />);
    expect(screen.getByText("지급 확정 대기 5,000P")).toBeInTheDocument();
  });

  it("uses a custom held label when provided (rider settlement)", () => {
    render(<PointBalanceCard available={0} held={5000} heldLabel="배송완료 시 확정" />);
    expect(screen.getByText("배송완료 시 확정 5,000P")).toBeInTheDocument();
  });

  it("renders the action slot when provided", () => {
    render(
      <PointBalanceCard available={12345} action={<PointHeroAction>출금 신청</PointHeroAction>} />,
    );
    expect(screen.getByTestId("point-hero-action")).toHaveTextContent("출금 신청");
  });

  it("[07 F5] generalizes to coupon balance via label/formatValue", () => {
    render(
      <PointBalanceCard
        available={12}
        label="보유 수거쿠폰"
        formatValue={(n) => `${n}장`}
      />,
    );
    expect(screen.getByText("보유 수거쿠폰")).toBeInTheDocument();
    expect(screen.getByText("12장")).toBeInTheDocument();
    // held 미지정이므로 보조 pill 없음.
    expect(screen.queryByTestId("point-balance-held")).not.toBeInTheDocument();
  });

  it("[07 F5] whole-card tap fires onClick (role=button)", () => {
    const onClick = vi.fn();
    render(<PointBalanceCard available={5} formatValue={(n) => `${n}장`} onClick={onClick} />);
    const card = screen.getByTestId("point-balance-card");
    expect(card).toHaveAttribute("role", "button");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

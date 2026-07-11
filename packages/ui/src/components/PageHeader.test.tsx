import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the centered title and a back button that fires onBack", () => {
    const onBack = vi.fn();
    render(<PageHeader title="수거 상세" onBack={onBack} backTestId="order-detail-back" />);

    expect(screen.getByRole("heading", { name: "수거 상세" })).toBeInTheDocument();
    const back = screen.getByTestId("order-detail-back");
    // 기본 aria-label은 "뒤로가기"(backAriaLabel로 재정의 가능).
    expect(back).toHaveAttribute("aria-label", "뒤로가기");
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders a custom right slot instead of the balancing spacer", () => {
    render(
      <PageHeader
        title="수거 상세"
        onBack={() => {}}
        right={<a href="/notifications" data-testid="header-bell">벨</a>}
      />,
    );
    expect(screen.getByTestId("header-bell")).toBeInTheDocument();
  });

  it("renders no back button when onBack is omitted (spacer keeps the title centered)", () => {
    render(<PageHeader title="시세 상세" backTestId="price-page-back" />);
    expect(screen.queryByTestId("price-page-back")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "시세 상세" })).toBeInTheDocument();
  });
});

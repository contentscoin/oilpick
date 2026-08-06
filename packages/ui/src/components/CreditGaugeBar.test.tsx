import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditGaugeBar } from "./CreditGaugeBar";

// [18 R6·R7] 라이더 포인트 지급 한도 게이지 — 모드별 라벨, 잔여 표기, 이번 건 초과 경고.
describe("CreditGaugeBar (18 R6)", () => {
  it("PER_RIDER: '내 포인트 지급 한도' 라벨과 잔여/사용/한도를 표기한다", () => {
    render(<CreditGaugeBar limitAmount={50000} used={20000} available={30000} allocationMode="PER_RIDER" />);
    expect(screen.getByText("내 포인트 지급 한도")).toBeInTheDocument();
    expect(screen.getByTestId("credit-gauge-available").textContent).toContain("30,000");
    expect(screen.getByTestId("credit-gauge").textContent).toContain("사용 20,000P");
    expect(screen.getByTestId("credit-gauge").textContent).toContain("한도 50,000P");
  });

  it("POOL: '좌상 공용 한도'로 표기하고 함께 쓰는 한도임을 알린다", () => {
    render(<CreditGaugeBar limitAmount={50000} used={10000} available={40000} allocationMode="POOL" />);
    expect(screen.getByText("좌상 공용 한도")).toBeInTheDocument();
    expect(screen.getByTestId("credit-gauge").textContent).toContain("함께 쓰는 한도");
  });

  it("한도가 없으면(무제한·미설정) 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <CreditGaugeBar limitAmount={null} used={0} available={0} allocationMode={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("이번 건이 잔여를 넘으면 초과 경고를 띄운다(현금 유도)", () => {
    render(
      <CreditGaugeBar limitAmount={50000} used={45000} available={5000} allocationMode="PER_RIDER" pendingAmount={9000} />,
    );
    expect(screen.getByTestId("credit-gauge-exceed").textContent).toContain("남은 한도를 넘어요");
  });

  it("이번 건이 잔여 안이면 경고 없이 예고 구간만 그린다", () => {
    render(
      <CreditGaugeBar limitAmount={50000} used={10000} available={40000} allocationMode="PER_RIDER" pendingAmount={9000} />,
    );
    expect(screen.queryByTestId("credit-gauge-exceed")).not.toBeInTheDocument();
    expect(screen.getByTestId("credit-gauge-pending")).toBeInTheDocument();
  });

  it("progressbar 시맨틱으로 사용량을 노출한다(바 색은 장식)", () => {
    render(<CreditGaugeBar limitAmount={50000} used={20000} available={30000} allocationMode="PER_RIDER" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "20000");
    expect(bar).toHaveAttribute("aria-valuemax", "50000");
  });
});

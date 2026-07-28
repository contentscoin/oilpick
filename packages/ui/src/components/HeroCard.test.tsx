import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroCard } from "./HeroCard";
import { CheckList } from "./CheckList";

describe("HeroCard", () => {
  it("renders the title", () => {
    render(<HeroCard title="20L 6통이면 예상 42,000원" />);
    expect(screen.getByTestId("hero-card-title")).toHaveTextContent("20L 6통이면 예상 42,000원");
  });

  it("renders eyebrow, description and footer when provided", () => {
    render(
      <HeroCard
        eyebrow="주간 목표 82%"
        title="총 41건 완료"
        description="숫자는 카운트업으로 갱신됩니다"
        footer={<button type="button">수거 요청</button>}
      />,
    );
    expect(screen.getByTestId("hero-card-eyebrow")).toHaveTextContent("주간 목표 82%");
    expect(screen.getByText("숫자는 카운트업으로 갱신됩니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수거 요청" })).toBeInTheDocument();
  });

  it("omits the eyebrow when not provided", () => {
    render(<HeroCard title="성수동 튀김공방" />);
    expect(screen.queryByTestId("hero-card-eyebrow")).not.toBeInTheDocument();
  });

  it("keeps the glare purely decorative", () => {
    // 글레어는 정보가 없어 reduced-motion에서 사라져도 손실이 없어야 한다.
    const { container } = render(<HeroCard title="x" />);
    const glare = container.querySelector(".oilpick-glare");
    expect(glare).toHaveAttribute("aria-hidden", "true");
    expect(glare).toHaveTextContent("");
  });
});

describe("CheckList", () => {
  const items = [
    { label: "상호 확인", state: "done" as const },
    { label: "현장 도착 인증", state: "current" as const },
    { label: "계량 입력", state: "todo" as const },
  ];

  it("renders every step with its label", () => {
    render(<CheckList items={items} />);
    expect(screen.getAllByTestId("check-row")).toHaveLength(3);
    expect(screen.getByText("현장 도착 인증")).toBeInTheDocument();
  });

  it("states each step in words, not only in colour", () => {
    render(<CheckList items={items} />);
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("대기")).toBeInTheDocument();
  });

  it("exposes the state on the row for styling and assertions", () => {
    render(<CheckList items={items} />);
    const rows = screen.getAllByTestId("check-row");
    expect(rows[0]).toHaveAttribute("data-state", "done");
    expect(rows[1]).toHaveAttribute("data-state", "current");
    expect(rows[2]).toHaveAttribute("data-state", "todo");
  });

  it("allows a custom hint to override the default label", () => {
    render(<CheckList items={[{ label: "계량 입력", state: "todo", hint: "다음" }]} />);
    expect(screen.getByText("다음")).toBeInTheDocument();
  });
});

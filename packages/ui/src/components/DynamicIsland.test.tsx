import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DynamicIsland } from "./DynamicIsland";
import { LiveDot } from "./LiveDot";
import { colors } from "../tokens";

describe("DynamicIsland", () => {
  it("renders the status text", () => {
    render(<DynamicIsland>14:35 도착 · 1.8km</DynamicIsland>);
    expect(screen.getByTestId("dynamic-island")).toHaveTextContent("14:35 도착 · 1.8km");
  });

  it("announces status changes politely", () => {
    render(<DynamicIsland>콜 받는 중</DynamicIsland>);
    const island = screen.getByTestId("dynamic-island");
    expect(island).toHaveAttribute("role", "status");
    expect(island).toHaveAttribute("aria-live", "polite");
  });

  it("shows a live dot by default and hides it when live is false", () => {
    const { rerender } = render(<DynamicIsland>배정 대기</DynamicIsland>);
    expect(screen.getByTestId("live-dot")).toBeInTheDocument();

    rerender(<DynamicIsland live={false}>배정 대기</DynamicIsland>);
    expect(screen.queryByTestId("live-dot")).not.toBeInTheDocument();
  });

  it("keeps the status readable without the dot — text carries the state", () => {
    // 색/도트만으로 상태를 알리지 않는다(15 원칙 3).
    render(<DynamicIsland live={false}>라이더 평균 배정 12분</DynamicIsland>);
    expect(screen.getByTestId("dynamic-island")).toHaveTextContent("라이더 평균 배정 12분");
  });

  it("renders a trailing node when provided", () => {
    render(<DynamicIsland trailing={<span>1/3</span>}>운행 중</DynamicIsland>);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });
});

describe("LiveDot", () => {
  it("is decorative — hidden from assistive tech", () => {
    render(<LiveDot />);
    expect(screen.getByTestId("live-dot")).toHaveAttribute("aria-hidden", "true");
  });

  it("carries the pulse class only when animated", () => {
    const { rerender } = render(<LiveDot />);
    expect(screen.getByTestId("live-dot")).toHaveClass("oilpick-live-dot");

    rerender(<LiveDot animated={false} />);
    expect(screen.getByTestId("live-dot")).not.toHaveClass("oilpick-live-dot");
  });

  it("defaults to the lime accent", () => {
    render(<LiveDot />);
    expect(screen.getByTestId("live-dot")).toHaveStyle({ backgroundColor: colors.lime.DEFAULT });
  });
});

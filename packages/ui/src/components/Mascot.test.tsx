import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot } from "./Mascot";

// 오반장(OBJ) 마스코트 — docs/spec/10-brand.md B3. 순수 SVG·접근성 라벨·크기 비율.

describe("Mascot", () => {
  it("접근성 라벨과 함께 렌더된다(기본 '오반장 캐릭터')", () => {
    render(<Mascot />);
    const svg = screen.getByTestId("obj-mascot");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "오반장 캐릭터");
    // "반장" 완장 텍스트가 포함된다(브랜드 콘셉트 핵심 요소).
    expect(screen.getByText("반장")).toBeInTheDocument();
  });

  it("size prop이 120:140 비율로 폭/높이에 반영된다", () => {
    render(<Mascot size={120} title="브랜드 마스코트" />);
    const svg = screen.getByTestId("obj-mascot");
    expect(svg).toHaveAttribute("width", "120");
    expect(svg).toHaveAttribute("height", "140");
    expect(svg).toHaveAttribute("aria-label", "브랜드 마스코트");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark (폐유 로고)", () => {
  it("접근성 라벨과 함께 렌더된다(기본 '폐유 로고')", () => {
    render(<BrandMark />);
    const svg = screen.getByTestId("payou-brandmark");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "폐유 로고");
  });

  it("size prop이 width/height에 반영된다", () => {
    render(<BrandMark size={64} title="테스트 로고" />);
    const svg = screen.getByTestId("payou-brandmark");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("aria-label", "테스트 로고");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoStatCard } from "./InfoStatCard";
import { colors } from "../tokens";

describe("InfoStatCard", () => {
  const stats = [
    { label: "예상 수량", value: "15.0kg" },
    { label: "오늘 매입가", value: "700원/kg" },
    { label: "예상 포인트", value: "10,500P", accent: true },
  ];

  it("renders all stat labels and values in three columns", () => {
    render(<InfoStatCard stats={stats} />);
    expect(screen.getByText("예상 수량")).toBeInTheDocument();
    expect(screen.getByText("700원/kg")).toBeInTheDocument();
    expect(screen.getByText("10,500P")).toBeInTheDocument();
    expect(screen.getAllByTestId("info-stat-cell")).toHaveLength(3);
  });

  it("accents the value when accent is true", () => {
    render(<InfoStatCard stats={stats} />);
    // 05 2026-07-10 폴리시: 밝은 배경 위 앰버 텍스트는 accent.deep(대비 4.5:1).
    expect(screen.getByText("10,500P")).toHaveStyle({ color: colors.accent.deep });
  });

  it("renders the footnote when provided", () => {
    render(<InfoStatCard stats={stats} footnote="현장 계량 기준으로 확정됩니다" />);
    expect(screen.getByTestId("info-stat-footnote")).toHaveTextContent("현장 계량 기준으로 확정됩니다");
  });

  it("omits the footnote when not provided", () => {
    render(<InfoStatCard stats={stats} />);
    expect(screen.queryByTestId("info-stat-footnote")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentToggle, type SegmentOption } from "./SegmentToggle";

const OPTIONS: SegmentOption<"7" | "30" | "90">[] = [
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
];

describe("SegmentToggle", () => {
  it("renders options, marks the selected one, and shows the sliding indicator", () => {
    render(<SegmentToggle options={OPTIONS} value="30" onChange={() => {}} ariaLabel="기간 선택" />);
    expect(screen.getByTestId("segment-toggle")).toHaveAttribute("aria-label", "기간 선택");
    expect(screen.getByTestId("segment-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("segment-option-30")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("segment-option-7")).toHaveAttribute("aria-checked", "false");
    // 선택 항목만 tabIndex 0(roving tabindex).
    expect(screen.getByTestId("segment-option-30")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("segment-option-7")).toHaveAttribute("tabindex", "-1");
  });

  it("calls onChange when a segment is clicked", () => {
    const onChange = vi.fn();
    render(<SegmentToggle options={OPTIONS} value="30" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("segment-option-90"));
    expect(onChange).toHaveBeenCalledWith("90");
  });

  it("moves selection with arrow keys (ArrowRight → next)", () => {
    const onChange = vi.fn();
    render(<SegmentToggle options={OPTIONS} value="30" onChange={onChange} />);
    fireEvent.keyDown(screen.getByTestId("segment-option-30"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("90");
  });

  it("wraps to the last option when ArrowLeft is pressed on the first", () => {
    const onChange = vi.fn();
    render(<SegmentToggle options={OPTIONS} value="7" onChange={onChange} />);
    fireEvent.keyDown(screen.getByTestId("segment-option-7"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("90");
  });

  it("Home/End jump to first/last", () => {
    const onChange = vi.fn();
    render(<SegmentToggle options={OPTIONS} value="30" onChange={onChange} />);
    fireEvent.keyDown(screen.getByTestId("segment-option-30"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("90");
    fireEvent.keyDown(screen.getByTestId("segment-option-30"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("7");
  });
});

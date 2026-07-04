import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    expect(screen.queryByTestId("bottom-sheet")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <BottomSheet open onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="제목">
        내용
      </BottomSheet>,
    );
    screen.getByTestId("bottom-sheet-backdrop").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

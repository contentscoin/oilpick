import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders the message", () => {
    render(<Toast message="네트워크 오류가 발생했어요" />);
    expect(screen.getByText("네트워크 오류가 발생했어요")).toBeInTheDocument();
  });

  it("renders a retry button and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<Toast message="네트워크 오류" variant="error" onRetry={onRetry} />);
    screen.getByTestId("toast-retry").click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BigButton } from "./BigButton";

describe("BigButton", () => {
  it("renders children and responds to click", () => {
    const onClick = vi.fn();
    render(<BigButton onClick={onClick}>수거 요청하기</BigButton>);
    const button = screen.getByRole("button", { name: "수거 요청하기" });
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows loading label and disables when loading", () => {
    render(<BigButton loading>수거 요청하기</BigButton>);
    const button = screen.getByRole("button", { name: "처리 중..." });
    expect(button).toBeDisabled();
  });
});

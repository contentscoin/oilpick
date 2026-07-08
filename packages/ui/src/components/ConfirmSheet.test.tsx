import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "./ConfirmSheet";
import { colors } from "../tokens";

describe("ConfirmSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmSheet open={false} onClose={() => {}} onConfirm={() => {}} title="정말 취소할까요?" />,
    );
    expect(screen.queryByTestId("confirm-sheet")).not.toBeInTheDocument();
    expect(screen.queryByText("정말 취소할까요?")).not.toBeInTheDocument();
  });

  it("renders the title and description when open", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="정말 취소할까요?"
        description="취소하면 되돌릴 수 없어요."
      />,
    );
    expect(screen.getByTestId("confirm-sheet")).toBeInTheDocument();
    expect(screen.getByText("정말 취소할까요?")).toBeInTheDocument();
    expect(screen.getByText("취소하면 되돌릴 수 없어요.")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmSheet open onClose={() => {}} onConfirm={onConfirm} title="정말 취소할까요?" />,
    );
    fireEvent.click(screen.getByTestId("confirm-sheet-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ConfirmSheet open onClose={onClose} onConfirm={() => {}} title="정말 취소할까요?" />,
    );
    fireEvent.click(screen.getByTestId("confirm-sheet-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the provided confirm/cancel labels", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="정말 취소할까요?"
        confirmLabel="주문 취소"
        cancelLabel="유지"
      />,
    );
    expect(screen.getByTestId("confirm-sheet-confirm")).toHaveTextContent("주문 취소");
    expect(screen.getByTestId("confirm-sheet-cancel")).toHaveTextContent("유지");
  });

  it("disables both buttons while loading and blocks duplicate confirm clicks", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmSheet open loading onClose={onClose} onConfirm={onConfirm} title="정말 취소할까요?" />,
    );
    const confirmButton = screen.getByTestId("confirm-sheet-confirm");
    const cancelButton = screen.getByTestId("confirm-sheet-cancel");
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    fireEvent.click(confirmButton);
    fireEvent.click(cancelButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the confirm button in the danger color when danger is set", () => {
    render(
      <ConfirmSheet open danger onClose={() => {}} onConfirm={() => {}} title="정말 취소할까요?" />,
    );
    expect(screen.getByTestId("confirm-sheet-confirm")).toHaveStyle({
      backgroundColor: colors.status.danger,
    });
  });
});

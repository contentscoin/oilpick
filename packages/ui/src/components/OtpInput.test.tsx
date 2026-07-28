import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./OtpInput";

describe("OtpInput", () => {
  it("renders one slot per digit", () => {
    render(<OtpInput value="" onChange={() => {}} />);
    expect(screen.getAllByTestId("otp-slot")).toHaveLength(6);
  });

  it("paints entered digits into the slots", () => {
    render(<OtpInput value="482" onChange={() => {}} />);
    const slots = screen.getAllByTestId("otp-slot");
    expect(slots[0]).toHaveTextContent("4");
    expect(slots[1]).toHaveTextContent("8");
    expect(slots[2]).toHaveTextContent("2");
    expect(slots[3]).toHaveTextContent("");
  });

  it("supports SMS autofill through a single real input", () => {
    render(<OtpInput value="" onChange={() => {}} />);
    const field = screen.getByTestId("otp-field");
    // 슬롯을 input 여러 개로 쪼개면 자동완성이 깨진다 — 하나여야 한다.
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
  });

  it("strips non-digits and clamps to the configured length", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} length={4} />);
    // 붙여넣기처럼 한 번에 들어온 문자열도 숫자만 남기고 길이를 자른다.
    fireEvent.change(screen.getByTestId("otp-field"), { target: { value: "12a3456" } });
    expect(onChange).toHaveBeenCalledWith("1234");
  });

  it("marks the field invalid and shows a message on error", () => {
    render(<OtpInput value="482910" onChange={() => {}} error errorMessage="인증번호가 올바르지 않습니다" />);
    expect(screen.getByTestId("otp-field")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("인증번호가 올바르지 않습니다");
  });

  it("shakes the slots on error — motion plus color plus text, never color alone", () => {
    const { rerender } = render(<OtpInput value="1" onChange={() => {}} />);
    expect(screen.getByTestId("otp-slots")).not.toHaveClass("oilpick-shake");

    rerender(<OtpInput value="1" onChange={() => {}} error errorMessage="틀렸습니다" />);
    expect(screen.getByTestId("otp-slots")).toHaveClass("oilpick-shake");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("labels the field for screen readers", () => {
    render(<OtpInput value="" onChange={() => {}} label="인증번호 6자리" />);
    expect(screen.getByLabelText("인증번호 6자리")).toBeInTheDocument();
  });
});

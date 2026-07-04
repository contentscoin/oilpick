import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddressField } from "./AddressField";

describe("AddressField", () => {
  it("renders the manual text fallback when no Kakao key is configured", () => {
    // apps/user/.env.development의 VITE_KAKAO_KEY는 항상 빈 값이라 이 폴백 분기만 렌더된다
    // (04-tasks.md 질문 목록: 카카오 주소검색 키 없음).
    render(<AddressField value={{ address: "", lat: 37.5, lng: 127 }} onChange={vi.fn()} />);
    expect(screen.getByTestId("address-field-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("address-input")).toBeInTheDocument();
  });

  it("calls onChange with updated address text", () => {
    const onChange = vi.fn();
    render(<AddressField value={{ address: "", lat: 37.5, lng: 127 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구" } });
    expect(onChange).toHaveBeenCalledWith({ address: "서울시 강서구", lat: 37.5, lng: 127 });
  });

  it("reveals manual lat/lng inputs when toggled", () => {
    const onChange = vi.fn();
    render(<AddressField value={{ address: "", lat: 37.5, lng: 127 }} onChange={onChange} />);
    expect(screen.queryByTestId("address-lat-input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("address-manual-coords-toggle"));
    expect(screen.getByTestId("address-lat-input")).toBeInTheDocument();
    expect(screen.getByTestId("address-lng-input")).toBeInTheDocument();
  });
});

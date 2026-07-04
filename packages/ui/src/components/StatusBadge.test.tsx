import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the Korean label for the given status", () => {
    render(<StatusBadge status="ACCEPTED" />);
    expect(screen.getByText("라이더 배정")).toBeInTheDocument();
  });

  it("renders the danger label for CANCELLED", () => {
    render(<StatusBadge status="CANCELLED" />);
    expect(screen.getByText("취소됨")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="아직 주문이 없어요" description="첫 수거를 요청해보세요" />);
    expect(screen.getByText("아직 주문이 없어요")).toBeInTheDocument();
    expect(screen.getByText("첫 수거를 요청해보세요")).toBeInTheDocument();
  });
});

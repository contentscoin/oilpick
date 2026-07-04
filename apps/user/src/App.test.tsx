import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the placeholder heading at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("OilPick User App")).toBeInTheDocument();
  });

  it("renders the dev-ui page at /dev-ui", () => {
    render(
      <MemoryRouter initialEntries={["/dev-ui"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "packages/ui 컴포넌트 미리보기" })).toBeInTheDocument();
  });
});

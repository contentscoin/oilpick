import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock("./lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("redirects to /onboarding when onboarding flag is not set", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("onboarding-slide-0")).toBeInTheDocument();
  });

  it("redirects to /auth when onboarding is done but not authenticated", async () => {
    localStorage.setItem("oilpick:onboarding-done", "1");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("phone-input")).toBeInTheDocument();
  });

  it("renders the dev-ui page at /dev-ui without auth", async () => {
    render(
      <MemoryRouter initialEntries={["/dev-ui"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "packages/ui 컴포넌트 미리보기" }),
    ).toBeInTheDocument();
  });

  it("renders the onboarding page at /onboarding directly", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("onboarding-slide-0")).toBeInTheDocument();
  });
});

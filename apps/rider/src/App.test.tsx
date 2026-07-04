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
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("redirects to /auth when not authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("phone-input")).toBeInTheDocument();
  });

  it("renders the auth page at /auth directly", async () => {
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("phone-input")).toBeInTheDocument();
  });

  it("redirects unknown routes to /", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown-route"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("phone-input")).toBeInTheDocument();
  });
});

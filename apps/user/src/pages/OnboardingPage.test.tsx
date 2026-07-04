import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ONBOARDING_DONE_KEY, OnboardingPage } from "./OnboardingPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/auth" element={<div>AUTH_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the first slide initially", () => {
    renderPage();
    expect(screen.getByTestId("onboarding-slide-0")).toBeInTheDocument();
  });

  it("advances through all 3 slides and navigates to /auth on finish", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-slide-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-slide-2")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("AUTH_PAGE")).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
  });

  it("skip button sets the flag and navigates to /auth immediately", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    expect(screen.getByText("AUTH_PAGE")).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
  });
});

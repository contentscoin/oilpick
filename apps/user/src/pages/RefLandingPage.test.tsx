import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_CODE_STORAGE_KEY } from "@oilpick/core";
import { RefLandingPage } from "./RefLandingPage";

// 09 H3 추천 랜딩 — 코드 저장 + 보너스 안내 + CTA.

const { mockUseSession } = vi.hoisted(() => ({ mockUseSession: vi.fn() }));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ref/:code" element={<RefLandingPage />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
        <Route path="/" element={<div data-testid="home-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RefLandingPage (09 H3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseSession.mockReturnValue({ session: null, loading: false });
  });

  it("유효한 코드를 localStorage에 저장하고 보너스 카드를 노출한다", () => {
    renderAt("/ref/abcd2345");
    expect(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)).toBe("ABCD2345");
    expect(screen.getByTestId("ref-bonus-card")).toBeInTheDocument();
    // 정규화된 코드 표기.
    expect(screen.getByTestId("ref-bonus-card").textContent).toContain("ABCD2345");
  });

  it("미인증 사용자는 CTA로 /auth로 이동한다", () => {
    renderAt("/ref/ABCD2345");
    fireEvent.click(screen.getByTestId("ref-start-button"));
    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
  });

  it("로그인 사용자는 CTA로 홈으로 이동한다", () => {
    mockUseSession.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    renderAt("/ref/ABCD2345");
    fireEvent.click(screen.getByTestId("ref-start-button"));
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("유효하지 않은 코드는 저장하지 않고 대체 카드를 노출한다", () => {
    renderAt("/ref/BADCODE"); // 7자 — 형식 위반
    expect(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId("ref-invalid-card")).toBeInTheDocument();
  });
});

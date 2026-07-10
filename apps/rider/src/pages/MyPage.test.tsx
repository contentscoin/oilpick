import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { colors } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyPage } from "./MyPage";

const { mockUseSession, mockUseRiderProfile, mockSignOut } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRiderProfile: vi.fn(),
  mockSignOut: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useRiderProfile", () => ({ useRiderProfile: mockUseRiderProfile }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { auth: { signOut: mockSignOut } } }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my"]}>
      <Routes>
        <Route path="/my" element={<MyPage />} />
        <Route path="/history" element={<div>HISTORY_PAGE</div>} />
        <Route path="/badge" element={<div>BADGE_PAGE</div>} />
        <Route path="/support" element={<div>SUPPORT_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MyPage — 마이(06 E9 진입점 + E12 카드화)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
    mockUseRiderProfile.mockReturnValue({
      data: {
        id: "rider-1",
        displayName: "김수거",
        vehicleNumber: "서울12가3456",
        verifyStatus: "APPROVED",
        rejectReason: null,
        isOnline: true,
      },
      isLoading: false,
    });
    localStorage.clear();
  });

  it("라이더 정보 카드와 메뉴 카드를 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("rider-info-card")).toBeInTheDocument();
    expect(screen.getByText("김수거")).toBeInTheDocument();
    expect(screen.getByText("서울12가3456")).toBeInTheDocument();
    expect(screen.getByTestId("menu-card")).toBeInTheDocument();
  });

  it("'운행 이력' 항목 클릭 시 /history로 이동한다(06 E9 진입점)", () => {
    renderPage();
    const link = screen.getByTestId("history-link");
    expect(link).toHaveTextContent("운행 이력");
    fireEvent.click(link);
    expect(screen.getByText("HISTORY_PAGE")).toBeInTheDocument();
  });

  it("준비중 항목(약관)은 버튼이 아닌 회색 비활성 행으로 유지한다", () => {
    renderPage();
    const placeholder = screen.getByTestId("terms-placeholder");
    expect(placeholder.tagName).not.toBe("BUTTON");
    expect(placeholder).toHaveStyle({ color: colors.status.wait });
    expect(placeholder).toHaveTextContent("준비 중");
  });

  it("알림 받기 토글이 켜짐/꺼짐을 전환한다", () => {
    renderPage();
    const toggle = screen.getByTestId("notify-toggle");
    expect(toggle).toHaveTextContent("켜짐");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("꺼짐");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider, colors } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallHomePage } from "./CallHomePage";

const {
  mockUseSession,
  mockUseRiderProfile,
  mockUseOpenCalls,
  mockUseTodayStats,
  mockUseGeolocation,
  mockFrom,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRiderProfile: vi.fn(),
  mockUseOpenCalls: vi.fn(),
  mockUseTodayStats: vi.fn(),
  mockUseGeolocation: vi.fn(),
  mockFrom: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useRiderProfile", () => ({ useRiderProfile: mockUseRiderProfile }));
vi.mock("../hooks/useOpenCalls", () => ({ useOpenCalls: mockUseOpenCalls }));
vi.mock("../hooks/useTodayStats", () => ({ useTodayStats: mockUseTodayStats }));
vi.mock("../hooks/useGeolocation", () => ({ useGeolocation: mockUseGeolocation }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

/** rider_profiles update 체인(from→update→eq) 목. */
function mockUpdateResult(error: unknown) {
  mockFrom.mockReturnValue({
    update: () => ({ eq: () => Promise.resolve({ error }) }),
  });
}

function renderHome() {
  // 페이지가 useToast를 쓰므로 실제 앱(App.tsx)과 동일하게 ToastProvider로 감싼다(E6).
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CallHomePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseRiderProfile.mockReturnValue({ data: { isOnline: true, verifyStatus: "APPROVED" } });
  mockUseOpenCalls.mockReturnValue({ data: [], isLoading: false });
  mockUseTodayStats.mockReturnValue({
    data: { completedCount: 2, collectedKg: 60, cashPaid: 96000, pointPaid: 21000 },
  });
  mockUseGeolocation.mockReturnValue(null);
});

describe("CallHomePage — 쿠폰 UI 제거(08 G6-①)", () => {
  it("쿠폰 잔액 히어로·충전 진입점이 없다", () => {
    renderHome();
    expect(screen.queryByText("보유 수거쿠폰")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-charge-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-card")).not.toBeInTheDocument();
  });
});

describe("CallHomePage — 오늘 실적(08 G6-④, 수단 분리)", () => {
  it("수거 kg / 현금 지급 / 포인트 지급", () => {
    renderHome();
    expect(screen.getByTestId("today-collected-kg")).toHaveTextContent("60.0kg");
    expect(screen.getByTestId("today-cash")).toHaveTextContent("96,000원");
    expect(screen.getByTestId("today-point")).toHaveTextContent("21,000P");
  });

  it("지급 현금 값은 밝은 배경 위 딥앰버(accent.deep)로 렌더한다(05 대비 폴리시)", () => {
    renderHome();
    expect(screen.getByTestId("today-cash")).toHaveStyle({ color: colors.accent.deep });
  });
});

describe("CallHomePage — 로딩 스켈레톤(잔액/실적 0 플래시 제거)", () => {
  it("오늘 실적 로딩 중에는 2카드 대신 스켈레톤을 렌더한다", () => {
    mockUseTodayStats.mockReturnValue({ data: undefined, isLoading: true });
    renderHome();
    expect(screen.getByTestId("today-stats-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("today-cash")).not.toBeInTheDocument();
  });
});

describe("CallHomePage — 콜 리스트 쿼리 에러", () => {
  it("실패 시 '지금은 콜이 없어요' 대신 에러 상태 + 재시도 버튼을 렌더한다", () => {
    const refetch = vi.fn();
    mockUseOpenCalls.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderHome();
    const error = screen.getByTestId("query-error");
    expect(error).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText("지금은 콜이 없어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("CallHomePage — 온·오프라인 토글 피드백(06 E6)", () => {
  it("오프라인→온라인 성공: '온라인 전환됐어요' 토스트", async () => {
    mockUseRiderProfile.mockReturnValue({ data: { isOnline: false, verifyStatus: "APPROVED" } });
    mockUpdateResult(null);
    renderHome();
    fireEvent.click(screen.getByTestId("online-toggle"));
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("온라인 전환됐어요"));
  });

  it("온라인→오프라인 성공: '오프라인으로 전환했어요' 토스트", async () => {
    mockUpdateResult(null);
    renderHome();
    fireEvent.click(screen.getByTestId("online-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("오프라인으로 전환했어요"),
    );
  });

  it("실패: 에러 토스트 + [재시도]로 다시 시도", async () => {
    mockUpdateResult({ message: "network" });
    renderHome();
    fireEvent.click(screen.getByTestId("online-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("온라인 상태 변경에 실패했어요"),
    );
    // 재시도 버튼 → update 재호출 성공 → 성공 토스트.
    mockUpdateResult(null);
    fireEvent.click(screen.getByTestId("toast-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("오프라인으로 전환했어요"),
    );
  });
});

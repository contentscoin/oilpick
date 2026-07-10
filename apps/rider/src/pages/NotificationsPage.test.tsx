import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { colors, elevation, surface } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "./NotificationsPage";

const { mockUseSession, mockUseNotifications, mockMarkRead } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseNotifications: vi.fn(),
  mockMarkRead: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useNotifications", () => ({
  useNotifications: mockUseNotifications,
  useMarkNotificationRead: () => mockMarkRead,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe("NotificationsPage — 알림함(06 E12 미읽음 바)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  });

  it("미읽음 항목에만 좌측 그린 바(4px)와 primary.light 배경을 적용한다", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        { id: 1, title: "새 콜 도착", body: "역삼동 30kg", link: null, readAt: null, createdAt: "2026-07-09T00:00:00Z" },
        { id: 2, title: "지난 알림", body: "완료 안내", link: null, readAt: "2026-07-08T00:00:00Z", createdAt: "2026-07-08T00:00:00Z" },
      ],
      isLoading: false,
    });
    renderPage();

    const unread = screen.getByTestId("notification-row-1");
    expect(unread).toHaveStyle({
      borderLeft: `4px solid ${colors.primary.DEFAULT}`,
      backgroundColor: colors.primary.light,
    });

    const read = screen.getByTestId("notification-row-2");
    expect(read).toHaveStyle({ backgroundColor: surface.card });
    expect(read).not.toHaveStyle({ borderLeftWidth: "4px" });
  });

  it("알림 카드에 elevation을 적용한다", () => {
    mockUseNotifications.mockReturnValue({
      data: [{ id: 1, title: "새 콜 도착", body: "역삼동 30kg", link: null, readAt: null, createdAt: "2026-07-09T00:00:00Z" }],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("notification-row-1")).toHaveStyle({ boxShadow: elevation.card });
  });

  it("로딩 스켈레톤의 반경은 radius 토큰(16px)을 쓴다", () => {
    mockUseNotifications.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("notifications-skeleton")).toHaveStyle({ borderRadius: "16px" });
  });

  it("알림이 없으면 EmptyState를 보여준다", () => {
    mockUseNotifications.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("쿼리 실패 시 빈 상태 대신 에러 상태 + 재시도 버튼을 렌더한다", () => {
    const refetch = vi.fn();
    mockUseNotifications.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPage();
    const error = screen.getByTestId("query-error");
    expect(error).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText("아직 알림이 없어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalled();
  });
});

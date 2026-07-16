import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell } from "./NotificationsBell";

// admin 알림 벨 — 미읽음 배지, 패널 토글, 행 클릭 시 읽음 처리 + 드로어 딥링크 재매핑 이동.

const { mockUseSession, mockUseAdminNotifications, mockMarkRead } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseAdminNotifications: vi.fn(),
  mockMarkRead: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useAdminNotifications", () => ({
  useAdminNotifications: mockUseAdminNotifications,
  useMarkAdminNotificationRead: () => mockMarkRead,
}));

const ROWS = [
  { id: 1, title: "이의신청 접수", body: "계량 이의신청이 접수됐어요.", link: "/orders/ord-1", readAt: null, createdAt: "2026-07-16T00:00:00Z" },
  { id: 2, title: "무수락 자동 취소", body: "30분 무수락으로 취소됐어요.", link: "/orders/ord-2", readAt: "2026-07-16T01:00:00Z", createdAt: "2026-07-16T00:30:00Z" },
];

function renderBell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NotificationsBell />} />
        <Route path="/orders" element={<div data-testid="orders-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotificationsBell (admin 알림 소비 지면)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "admin-1" } }, loading: false });
    mockUseAdminNotifications.mockReturnValue({ data: ROWS, isLoading: false });
    mockMarkRead.mockResolvedValue(undefined);
  });

  it("미읽음 수를 배지로 표시한다", () => {
    renderBell();
    expect(screen.getByTestId("notifications-badge").textContent).toBe("1");
  });

  it("미읽음이 없으면 배지를 숨긴다", () => {
    mockUseAdminNotifications.mockReturnValue({
      data: ROWS.map((r) => ({ ...r, readAt: "2026-07-16T02:00:00Z" })),
      isLoading: false,
    });
    renderBell();
    expect(screen.queryByTestId("notifications-badge")).not.toBeInTheDocument();
  });

  it("벨 클릭으로 패널을 토글하고 알림 행을 렌더한다", () => {
    renderBell();
    expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("notifications-bell"));
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
    expect(screen.getByText("이의신청 접수")).toBeInTheDocument();
  });

  it("미읽음 행 클릭 시 읽음 처리 후 /orders 드로어 딥링크로 이동한다", async () => {
    renderBell();
    fireEvent.click(screen.getByTestId("notifications-bell"));
    fireEvent.click(screen.getByTestId("admin-notification-row-1"));
    expect(await screen.findByTestId("orders-page")).toBeInTheDocument();
    expect(mockMarkRead).toHaveBeenCalledWith(1);
  });

  it("읽음 행 클릭은 재읽음 처리 없이 이동만 한다", async () => {
    renderBell();
    fireEvent.click(screen.getByTestId("notifications-bell"));
    fireEvent.click(screen.getByTestId("admin-notification-row-2"));
    expect(await screen.findByTestId("orders-page")).toBeInTheDocument();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it("알림이 없으면 빈 안내를 보여준다", () => {
    mockUseAdminNotifications.mockReturnValue({ data: [], isLoading: false });
    renderBell();
    fireEvent.click(screen.getByTestId("notifications-bell"));
    expect(screen.getByTestId("notifications-empty")).toBeInTheDocument();
  });
});

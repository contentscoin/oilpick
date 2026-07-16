import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatRelativeTime } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useAdminNotifications, useMarkAdminNotificationRead } from "../hooks/useAdminNotifications";
import { remapToAdminRoute } from "../lib/adminLink";

/**
 * admin 알림 벨(사이드바) — 이의신청·무수락 자동 취소 등 admin 대상 notifications의 소비 지면.
 * 00-domain.md 알림 매트릭스가 요구하는 "admin 웹 알림"이 기존엔 어디에도 표면화되지 않던
 * 확정 결함(교차 이음새 감사)의 수정. 미읽음 배지 + 토글 패널, 행 클릭 시 읽음 처리 후
 * remapToAdminRoute로 admin 라우트(/orders?order=<id> 드로어 딥링크)로 이동한다.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const [open, setOpen] = useState(false);

  const { data: notifications, isLoading } = useAdminNotifications(userId);
  const markRead = useMarkAdminNotificationRead(userId);

  const unreadCount = (notifications ?? []).filter((n) => !n.readAt).length;

  async function handleRowClick(notification: NonNullable<typeof notifications>[number]) {
    if (!notification.readAt) {
      await markRead(notification.id);
    }
    setOpen(false);
    const path = remapToAdminRoute(notification.link);
    if (path) navigate(path);
  }

  return (
    <div className="relative px-3 pb-2">
      <button
        type="button"
        data-testid="notifications-bell"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-card px-3 py-2.5 text-sm font-medium transition-colors ${
          open ? "bg-primary-light text-primary" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        <span>🔔 알림</span>
        {unreadCount > 0 && (
          <span
            data-testid="notifications-badge"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notifications-panel"
          className="absolute left-3 top-full z-40 mt-1 max-h-96 w-80 overflow-y-auto rounded-card border border-gray-100 bg-white p-2 shadow-raised"
        >
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-gray-500">불러오는 중...</p>
          ) : (notifications ?? []).length === 0 ? (
            <p data-testid="notifications-empty" className="px-3 py-4 text-sm text-gray-500">
              아직 알림이 없어요.
            </p>
          ) : (
            (notifications ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                data-testid={`admin-notification-row-${n.id}`}
                onClick={() => handleRowClick(n)}
                className={`block w-full rounded-card px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                  n.readAt ? "" : "bg-primary-light/50"
                }`}
              >
                <p className={`text-sm ${n.readAt ? "font-medium text-gray-700" : "font-bold text-gray-900"}`}>
                  {n.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
                <p className="mt-1 text-xs text-gray-400">{formatRelativeTime(n.createdAt)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

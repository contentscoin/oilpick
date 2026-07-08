import { EmptyState, colors, gray, radius, surface } from "@oilpick/ui";
import { formatRelativeTime } from "@oilpick/core";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useMarkNotificationRead, useNotifications } from "../hooks/useNotifications";

/**
 * 알림함 공통 화면(U14). 03-frontend.md 작업 지시:
 * "notifications 테이블 조회 + Realtime 구독 + 읽음 처리(read_at update)".
 * 06-enhancement-plan.md E1: 탭바는 레이아웃(AppShell)이 제공하므로 UserShell로 감싸지 않는다.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: notifications, isLoading } = useNotifications(userId);
  const markRead = useMarkNotificationRead(userId);

  async function handleClick(notification: NonNullable<typeof notifications>[number]) {
    if (!notification.readAt) {
      await markRead(notification.id);
    }
    if (notification.link) navigate(notification.link);
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>알림</h1>

        {isLoading ? (
          <div data-testid="notifications-skeleton" style={{ borderRadius: 16, height: 200, backgroundColor: gray[100] }} />
        ) : notifications && notifications.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  data-testid={`notification-row-${n.id}`}
                  onClick={() => handleClick(n)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: radius.card,
                    padding: 16,
                    border: `1px solid ${surface.border}`,
                    backgroundColor: n.readAt ? surface.card : colors.primary.light,
                    cursor: "pointer",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 15, fontWeight: n.readAt ? 500 : 700 }}>{n.title}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{n.body}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: colors.status.wait }}>
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="아직 알림이 없어요" description="새 소식이 오면 여기에 표시돼요." />
        )}
    </main>
  );
}

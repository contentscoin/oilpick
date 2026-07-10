import { EmptyState, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import { formatRelativeTime } from "@oilpick/core";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useMarkNotificationRead, useNotifications } from "../hooks/useNotifications";

/**
 * R11 알림함. apps/user/src/pages/NotificationsPage.tsx와 동일 구조(RiderShell은 App.tsx에서
 * 이미 감싸므로 여기서는 화면 본문만 렌더).
 *
 * 06 E12 — 미읽음 항목에 좌측 그린 바(4px, 기존 primary.light 배경 유지) + 카드 elevation,
 * 스켈레톤 반경 하드코딩을 radius 토큰으로 치환.
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
        <div data-testid="notifications-skeleton" style={{ borderRadius: radius.card, height: 200, backgroundColor: gray[100] }} />
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
                  // 미읽음 좌측 그린 바(4px)가 본문을 밀지 않도록 좌측 패딩으로 3px 보정.
                  padding: n.readAt ? 16 : "16px 16px 16px 13px",
                  border: `1px solid ${surface.border}`,
                  // 06 E12 — 미읽음 표시: 좌측 그린 바 + 기존 primary.light 배경 유지.
                  borderLeft: n.readAt ? undefined : `4px solid ${colors.primary.DEFAULT}`,
                  backgroundColor: n.readAt ? surface.card : colors.primary.light,
                  boxShadow: elevation.card,
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

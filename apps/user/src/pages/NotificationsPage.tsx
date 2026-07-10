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

  const { data: notifications, isLoading, isError, refetch } = useNotifications(userId);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && notifications === undefined;
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
        ) : loadFailed ? (
          // 쿼리 실패는 빈 상태로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다.
          <div data-testid="query-error">
            <EmptyState
              title="불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <button
                  type="button"
                  data-testid="query-error-retry"
                  onClick={() => refetch()}
                  style={{
                    minHeight: 44,
                    padding: "0 20px",
                    borderRadius: radius.button,
                    border: `1px solid ${surface.border}`,
                    backgroundColor: surface.card,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  다시 시도
                </button>
              }
            />
          </div>
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

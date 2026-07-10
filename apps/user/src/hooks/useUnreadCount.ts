import { useNotifications } from "./useNotifications";

/**
 * 06-enhancement-plan.md E7 — 알림 미읽음 카운트. 홈·주문상세 헤더의 벨 배지가 공용으로 쓴다.
 * 별도 count 쿼리를 만들지 않고 useNotifications(알림함과 동일 queryKey·limit 50)를 재사용한다 —
 * INSERT Realtime 구독과 읽음 처리(useMarkNotificationRead)의 invalidate 흐름에 그대로 편승하므로
 * 새 알림 도착/알림함 진입 후 읽음 처리 시 배지가 즉시 갱신된다.
 */
export function useUnreadCount(userId: string | undefined): number {
  const { data } = useNotifications(userId);
  return (data ?? []).filter((n) => !n.readAt).length;
}

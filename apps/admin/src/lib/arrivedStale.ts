import { ARRIVED_STALE_MS } from "@oilpick/core";

/**
 * 07 F12-⑤ / 07 §1-3: ARRIVED 상태로 24h를 초과해 체류 중인 주문인지 판정한다(교착 조기 감지).
 * arrivedAt은 order_events(to_status='ARRIVED')에서 온 진입 시각(useOrdersAdmin). ARRIVED가
 * 아니거나 진입 시각을 알 수 없으면 하이라이트하지 않는다(false).
 * now는 테스트에서 시간을 고정하기 위해 주입 가능(기본 Date.now()).
 */
export function isArrivedStale(
  status: string,
  arrivedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (status !== "ARRIVED" || !arrivedAt) return false;
  const enteredAt = new Date(arrivedAt).getTime();
  if (Number.isNaN(enteredAt)) return false;
  return now - enteredAt > ARRIVED_STALE_MS;
}

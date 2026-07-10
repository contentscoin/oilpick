/**
 * 06 E3 — foreground 푸시의 "신규 콜" 분류기(순수 함수 — push.ts에서 분리해 단위 테스트).
 *
 * 판별은 서버가 넣는 FCM data.type === "NEW_CALL"로만 한다(order-create 최초 브로드캐스트 +
 * order-expire 재브로드캐스트). link 기반 판별은 금지 — order-transition의 완료/취소/중재 푸시도
 * 전부 link=/orders/:id라서 딥링크 재매핑(/calls/:id)만으로는 신규 콜과 구분할 수 없고,
 * 오분류 시 완료 알림이 콜 배너·알림음으로 오발화한다(적대적 리뷰 확정 결함의 재발 방지).
 */
export interface CallAlertDetail {
  orderId: string;
  title: string;
  body: string;
}

export function toCallAlertDetail(notification: {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}): CallAlertDetail | null {
  const data = notification.data;
  if (data?.type !== "NEW_CALL") return null;
  const link = typeof data.link === "string" ? data.link : undefined;
  // 서버 표기(/orders/:id)와 rider 라우트(/calls/:id) 둘 다 수용.
  const orderId = link?.match(/^\/(?:orders|calls)\/([^/]+)$/)?.[1];
  if (!orderId) return null;
  return { orderId, title: notification.title ?? "", body: notification.body ?? "" };
}

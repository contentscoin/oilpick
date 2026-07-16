// admin 알림 link 재매핑 — notifications.link는 모바일/공용 표기(/orders/:id)로 저장되는데
// (order-transition notifyAdmins·order-expire), admin 웹의 주문 상세는 라우트가 아니라
// /orders?order=<id> 드로어 딥링크다(07 F12 CS→드로어 선례). rider deeplink.ts의
// remapToRiderRoute와 동일한 "서버 표기 → 앱 라우트" 계층.

/** 알림 벨이 이동 가능한 admin 라우트(App.tsx와 동기). 미지 경로는 null(캐치올 이동 방지). */
const ADMIN_PATHS = new Set(["/", "/price", "/orders", "/users", "/settlement", "/cs", "/referrals", "/notify"]);

/**
 * 서버 저장 link → admin 라우트 재매핑.
 * - "/orders/<id>" → "/orders?order=<id>" (OrdersPage 드로어 딥링크)
 * - admin에 실존하는 경로("/orders", "/cs" 등)는 그대로
 * - 그 외(모바일 전용 "/wallet", 미지 경로, null) → null (호출부 no-op — NotFound로 보내지 않는다)
 */
export function remapToAdminRoute(link: string | null | undefined): string | null {
  if (!link) return null;
  const path = link.trim();
  if (path === "") return null;

  const orderId = path.match(/^\/orders\/([^/?#]+)\/?$/)?.[1];
  if (orderId) return `/orders?order=${encodeURIComponent(orderId)}`;

  return ADMIN_PATHS.has(path) ? path : null;
}

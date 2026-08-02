// admin 알림 link 재매핑 — notifications.link는 모바일/공용 표기(/orders/:id)로 저장되는데
// (order-transition notifyAdmins·order-expire), admin 웹의 주문 상세는 라우트가 아니라
// /orders?order=<id> 드로어 딥링크다(07 F12 CS→드로어 선례). rider deeplink.ts의
// remapToRiderRoute와 동일한 "서버 표기 → 앱 라우트" 계층.

/** 알림 벨이 이동 가능한 admin 라우트(App.tsx와 동기). 미지 경로는 null(캐치올 이동 방지). */
// [16 L10 리뷰 수정] 13 I3에서 추가된 dealer 라우트(/dealers·/performance·/statement)와
// 14 J3의 /dealer-settlement가 누락돼 있었다 — L8 알림(link=/statement,
// /dealer-settlement?dealer=<id>)이 벨에서 전부 죽은 링크였던 확정 결함.
const ADMIN_PATHS = new Set([
  "/",
  "/price",
  "/orders",
  "/users",
  "/settlement",
  "/cs",
  "/referrals",
  "/notify",
  "/dealers",
  "/dealer-settlement",
  "/performance",
  "/statement",
]);

/**
 * 서버 저장 link → admin 라우트 재매핑.
 * - "/orders/<id>" → "/orders?order=<id>" (OrdersPage 드로어 딥링크)
 * - admin에 실존하는 경로("/orders", "/cs" 등)는 그대로 — 쿼리스트링은 pathname으로 판정 후
 *   보존한다([16 L8] "/dealer-settlement?dealer=<id>" — 쿼리는 dedupe 키·후속 필터용)
 * - 그 외(모바일 전용 "/wallet", 미지 경로, null) → null (호출부 no-op — NotFound로 보내지 않는다)
 */
export function remapToAdminRoute(link: string | null | undefined): string | null {
  if (!link) return null;
  const path = link.trim();
  if (path === "") return null;

  const orderId = path.match(/^\/orders\/([^/?#]+)\/?$/)?.[1];
  if (orderId) return `/orders?order=${encodeURIComponent(orderId)}`;

  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  return ADMIN_PATHS.has(pathname) ? path : null;
}

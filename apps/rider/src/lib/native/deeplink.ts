// 딥링크 경로 정규화 + 라우팅 헬퍼(apps/rider).
//
// 알림/푸시의 link 필드는 앱 상대경로로 저장된다(supabase/functions/*: sendPush(..., link)).
// 커스텀 스킴 딥링크는 oilpick-rider://calls/:id 형태(03-frontend.md "Capacitor 설정").
//
// 중요: 서버 push 헬퍼는 rider에게 신규 콜을 보낼 때 link="/orders/:id"를 쓰지만
// (order-create/index.ts, order-expire/index.ts — supplier/rider 공용 경로 표기),
// rider 앱의 콜 상세 라우트는 "/calls/:id"이고 출금은 "/earnings"다. 여기서 rider 라우팅으로
// 재매핑한다(03-frontend.md apps/rider 라우팅 표: /calls/:id, /earnings, /verify).

/** react-router의 navigate(path) 시그니처만 요구. */
export type NavigateFn = (path: string) => void;

const APP_SCHEME = "oilpick-rider://";

/**
 * 서버 link 표기 → rider 앱 라우트 재매핑.
 * - "/orders/:id" → "/calls/:id" (신규 콜 딥링크)
 * - "/wallet"     → "/earnings"  (출금 알림)
 * - 그 외("/verify", "/calls/:id", "/earnings" 등)는 그대로.
 */
function remapToRiderRoute(path: string): string {
  const ordersMatch = path.match(/^\/orders\/([^/]+)\/?$/);
  if (ordersMatch) return `/calls/${ordersMatch[1]}`;
  if (path === "/wallet" || path === "/wallet/") return "/earnings";
  return path;
}

/**
 * 푸시 data.link 또는 커스텀 스킴 URL을 rider 앱 내부 라우터 경로로 정규화한다.
 * - "oilpick-rider://calls/123" → "/calls/123"
 * - "/orders/123" → "/calls/123" (rider 재매핑)
 * - 빈 값/파싱 불가/외부 URL → null (호출부에서 무시)
 */
export function normalizeDeepLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (path === "") return null;

  if (path.startsWith(APP_SCHEME)) {
    const rest = path.slice(APP_SCHEME.length);
    path = rest.startsWith("/") ? rest : `/${rest}`;
  }

  // 절대 URL(https 등)은 앱 라우팅 대상이 아니므로 무시.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null;

  if (!path.startsWith("/")) path = `/${path}`;
  return remapToRiderRoute(path);
}

/** 정규화된 링크로 앱 내부 이동. path가 null이면 no-op. */
export function routeToDeepLink(navigate: NavigateFn, raw: string | null | undefined): void {
  const path = normalizeDeepLink(raw);
  if (path) navigate(path);
}

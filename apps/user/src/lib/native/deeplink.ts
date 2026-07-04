// 딥링크 경로 정규화 + 라우팅 헬퍼(apps/user).
//
// 알림/푸시의 link 필드는 앱 상대경로(예: "/orders/:id", "/wallet")로 저장된다
// (supabase/functions/*: sendPush(..., link)). 커스텀 스킴 딥링크는
// oilpick-user://orders/:id 형태로 들어온다(03-frontend.md "Capacitor 설정").
// 두 경우 모두 여기서 앱 내부 라우터 경로로 변환한다.

/** react-router의 navigate(path) 시그니처만 요구(테스트/웹 no-op와 분리). */
export type NavigateFn = (path: string) => void;

const APP_SCHEME = "oilpick-user://";

/**
 * 푸시 data.link 또는 커스텀 스킴 URL을 앱 내부 라우터 경로로 정규화한다.
 * - "oilpick-user://orders/123" → "/orders/123"
 * - "/orders/123" → "/orders/123"
 * - 빈 값/파싱 불가 → null (호출부에서 무시)
 *
 * apps/user는 링크 경로가 그대로 라우트와 1:1이라 재매핑이 필요 없다
 * (rider 앱은 /orders/:id → /calls/:id 재매핑이 있으나 여기선 불필요).
 */
export function normalizeDeepLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (path === "") return null;

  if (path.startsWith(APP_SCHEME)) {
    // 커스텀 스킴: 스킴 뒤 host+path를 경로로 취급("orders/123" → "/orders/123").
    const rest = path.slice(APP_SCHEME.length);
    path = rest.startsWith("/") ? rest : `/${rest}`;
  }

  // 절대 URL(https 등)은 앱 라우팅 대상이 아니므로 무시.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null;

  if (!path.startsWith("/")) path = `/${path}`;
  return path;
}

/** 정규화된 링크로 앱 내부 이동. path가 null이면 no-op. */
export function routeToDeepLink(navigate: NavigateFn, raw: string | null | undefined): void {
  const path = normalizeDeepLink(raw);
  if (path) navigate(path);
}

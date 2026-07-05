/**
 * U1: 최초 1회만 노출되는 온보딩 완료 플래그. 재방문 시 스킵(03-frontend.md).
 *
 * 이 상수만 별도 모듈로 둔 이유: App.tsx의 RootRoute(eager)가 값을 읽어야 하는데,
 * OnboardingPage(무거운 lazy 청크)에서 직접 import하면 페이지 전체가 초기 번들로 끌려온다.
 * 상수를 분리해 lazy 분할을 유지한다.
 */
export const ONBOARDING_DONE_KEY = "oilpick:onboarding-done";

// 네이티브 통합 진입점(apps/user). 앱 마운트 시 1회 호출.
// - 커스텀 스킴 딥링크(oilpick-user://...) 수신 → 라우팅
// - 스플래시 숨김
// - 푸시(FCM) 초기화는 initPush에 위임(권한 온보딩 포함)
//
// 전부 Capacitor.isNativePlatform() 가드로 웹에서는 no-op. 웹 번들/브라우저 실행에 영향 없음.

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import type { NavigateFn } from "./deeplink";
import { routeToDeepLink } from "./deeplink";
import { initPush } from "./push";

export { requestPushPermissionAndRegister, refreshPushRegistration } from "./push";
export type { NavigateFn } from "./deeplink";
export { normalizeDeepLink } from "./deeplink";

let initialized = false;

/**
 * 네이티브 통합 초기화. navigate는 react-router의 navigate 함수를 넘긴다.
 * 반환: 정리(cleanup) 함수(리스너 해제). 웹에서는 no-op cleanup.
 */
export async function initNative(navigate: NavigateFn): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  if (initialized) return () => {};
  initialized = true;

  // 커스텀 스킴 딥링크: 앱이 oilpick-user://orders/:id 로 열릴 때.
  const urlOpenHandle = await App.addListener("appUrlOpen", (event) => {
    routeToDeepLink(navigate, event.url);
  });

  // 푸시 초기화(권한 요청 + 등록 + 수신/탭 핸들러). 실패해도 앱 실행을 막지 않는다.
  try {
    await initPush(navigate);
  } catch (err) {
    console.error("푸시 초기화 실패(앱 실행에는 영향 없음)", err);
  }

  // 웹뷰 준비 완료 → 스플래시 숨김.
  try {
    await SplashScreen.hide();
  } catch {
    /* 스플래시 없음/이미 숨김 — 무시 */
  }

  return () => {
    void urlOpenHandle.remove();
  };
}

// FCM 푸시 연동(apps/rider). 02-api.md "푸시 발송 헬퍼" + 03-frontend.md "Capacitor 설정".
//
// 웹(브라우저)에는 Capacitor 네이티브 API가 없다 — 모든 진입점은 Capacitor.isNativePlatform()
// 가드로 no-op 처리한다(웹 개발/실행이 깨지면 안 됨, 태스크 지시사항). apps/user/push.ts와
// 동일 패턴이며, 딥링크 재매핑만 rider용 deeplink.ts를 사용한다.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { NavigateFn } from "./deeplink";
import { routeToDeepLink } from "./deeplink";
import { supabase } from "../supabaseClient";

/** 등록 토큰을 로그인 라이더의 profiles.fcm_token에 저장(본인 row update, RLS 허용 범위). */
async function saveFcmToken(token: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("profiles").update({ fcm_token: token }).eq("id", user.id);
  if (error) {
    console.error("fcm_token 저장 실패", error);
  }
}

let registered = false;

/**
 * 푸시 권한 요청 → 등록 → 토큰 저장 + 수신/탭 핸들러 배선.
 * 웹에서는 즉시 no-op 반환. 리스너는 1회만 등록한다.
 */
export async function initPush(navigate: NavigateFn): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registered) return;
  registered = true;

  await PushNotifications.addListener("registration", (token) => {
    void saveFcmToken(token.value);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("푸시 등록 실패", err);
  });

  // foreground 수신: 리스너만 등록해 둔다(iOS foreground 알림 이벤트 유실 방지).
  // Phase 1은 알림함(notifications) + Realtime로 화면을 갱신하므로 별도 배너 UI는 없다.
  await PushNotifications.addListener("pushNotificationReceived", () => {
    /* Phase 1: foreground 배너/카운트 UI 없음 — Realtime 구독이 화면을 갱신한다. */
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const link =
      (action.notification.data as Record<string, unknown> | undefined)?.link ?? undefined;
    routeToDeepLink(navigate, typeof link === "string" ? link : undefined);
  });

  await requestPushPermissionAndRegister();
}

/**
 * 권한 요청 후 승인 시 등록. 온보딩 UI의 "알림 허용" 버튼에서도 재사용 가능.
 * 반환값: 최종 권한 상태. 웹에서는 'unavailable'.
 */
export async function requestPushPermissionAndRegister(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return "unavailable";

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    return perm.receive;
  }
  await PushNotifications.register();
  return "granted";
}

/** 로그인 직후 재등록 트리거(앱 시작 시 로그인 전이면 토큰 저장이 보류되므로). 웹에서는 no-op. */
export async function refreshPushRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const perm = await PushNotifications.checkPermissions();
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }
}

// FCM 푸시 연동(apps/user). 02-api.md "푸시 발송 헬퍼" + 03-frontend.md "Capacitor 설정".
//
// 웹(브라우저)에는 Capacitor 네이티브 API가 없다 — 모든 진입점은 Capacitor.isNativePlatform()
// 가드로 no-op 처리한다(웹 개발/실행이 깨지면 안 됨, 태스크 지시사항). 실제 등록/수신/탭
// 핸들링은 네이티브(iOS/Android)에서만 동작한다.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { NavigateFn } from "./deeplink";
import { routeToDeepLink } from "./deeplink";
import { supabase } from "../supabaseClient";

/** 등록 토큰을 로그인 사용자의 profiles.fcm_token에 저장(본인 row update, RLS 허용 범위). */
async function saveFcmToken(token: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // 로그인 전이면 저장 보류(로그인 후 재등록 시 저장됨).
  const { error } = await supabase.from("profiles").update({ fcm_token: token }).eq("id", user.id);
  if (error) {
    console.error("fcm_token 저장 실패", error);
  }
}

let registered = false;

/**
 * 푸시 권한 요청 → 등록 → 토큰 저장 + 수신/탭 핸들러 배선.
 * navigate: 알림 탭 시 딥링크 이동에 사용(react-router navigate).
 * 웹에서는 즉시 no-op 반환. 중복 호출 방지를 위해 리스너는 1회만 등록한다.
 */
export async function initPush(navigate: NavigateFn): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registered) return;
  registered = true;

  // 등록 성공: 토큰 저장.
  await PushNotifications.addListener("registration", (token) => {
    void saveFcmToken(token.value);
  });

  // 등록 실패: 로그만(핵심 로직을 막지 않음 — push.ts 서버 헬퍼와 동일 철학).
  await PushNotifications.addListener("registrationError", (err) => {
    console.error("푸시 등록 실패", err);
  });

  // foreground 수신: OS가 배너를 자동 표시하지 않으므로 필요 시 여기서 처리한다.
  // Phase 1은 알림함(notifications 테이블) + Realtime로 화면을 갱신하므로 별도 배너 UI 없이
  // 리스너만 등록해 둔다(등록해두지 않으면 iOS foreground 알림 이벤트가 유실될 수 있음).
  await PushNotifications.addListener("pushNotificationReceived", () => {
    /* Phase 1: foreground 배너/카운트 UI 없음 — Realtime 구독이 화면을 갱신한다. */
  });

  // 알림 탭: data.link에 따라 딥링크 라우팅(oilpick-user://orders/:id 등과 동일 경로 규약).
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const link =
      (action.notification.data as Record<string, unknown> | undefined)?.link ?? undefined;
    routeToDeepLink(navigate, typeof link === "string" ? link : undefined);
  });

  await requestPushPermissionAndRegister();
}

/**
 * 권한 요청 후 승인 시 등록. 온보딩 UI의 "알림 허용" 버튼에서도 재사용 가능.
 * 반환값: 최종 권한 상태('granted' | 'denied' | 'prompt' 등). 웹에서는 'unavailable'.
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

/**
 * 로그인 시점에 이미 발급된 토큰이 없을 수 있으므로, 로그인 직후 재등록을 트리거해
 * registration 리스너가 최신 토큰을 저장하도록 한다. 웹에서는 no-op.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const perm = await PushNotifications.checkPermissions();
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }
}

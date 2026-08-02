import { useCallback, useEffect, useRef, useState } from "react";
import { formatKg } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { playCallAlertSound, type AlertSoundFn } from "../lib/alertSound";
import { useSession } from "./useSession";
import { useRiderProfile } from "./useRiderProfile";

/**
 * 06 E3 — 콜 도착 포그라운드 알림 로직. CallAlertListener(App 루트)가 이 훅으로
 * 배너 상태를 받아 그리고, 알림음/진동 발화는 훅이 책임진다.
 *
 * 수신 경로 2개:
 *  ① Realtime: pickup_orders INSERT(status=REQUESTED) — useOpenCalls.ts의 채널 패턴을
 *     따르되 목록 무효화 채널과 별도 전용 채널(발화 게이트에 따라 구독/해제).
 *  ② FCM foreground: push.ts가 dispatch하는 CustomEvent(CALL_ALERT_EVENT).
 * 두 경로가 같은 콜을 이중 수신할 수 있어 orderId별 최근 발화 시각으로 dedupe한다
 * (같은 orderId는 CALL_ALERT_DISMISS_MS 내 1회만 발화).
 */

/** 배너에 그릴 알림 1건. */
export interface CallAlert {
  orderId: string;
  message: string;
}

/** push.ts foreground 리스너가 발행하는 커스텀 이벤트 이름(detail: { orderId, title, body }). */
export const CALL_ALERT_EVENT = "oilpick:call-alert";

/** 배너 자동 소멸 시간 = 같은 orderId 중복 발화 방지 창(ms). */
export const CALL_ALERT_DISMISS_MS = 4000;

/**
 * 배너용 주소 요약: "서울시 강남구 테헤란로 123" → "강남구 테헤란로".
 * 시/도(첫 토큰)와 번지(뒤 토큰)를 떼고 구·로 수준만 남긴다(06 E3 "○○동 5kg" 카피).
 */
export function summarizeAddress(address: string): string {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return tokens.join(" ");
  return tokens.slice(1, 3).join(" ");
}

export interface UseCallAlertOptions {
  /** 알림음 끄기([16 L3 §3-5] 마이 "콜 알림음" 토글 배선). 배너·진동은 그대로 발화한다. */
  mute?: boolean;
  /** 진동 끄기(기본 켜짐 — [16 L3 §3-5] 후속 설정 확장용 옵션. 현재 토글은 mute만 배선). */
  vibrate?: boolean;
  /** 알림음 구현 주입(기본 playCallAlertSound — 테스트에서 spy로 대체). */
  playSound?: AlertSoundFn;
}

export function useCallAlert(options: UseCallAlertOptions = {}): {
  alert: CallAlert | null;
  dismiss: () => void;
} {
  const { mute = false, vibrate = true, playSound = playCallAlertSound } = options;
  const { session } = useSession();
  const { data: rider } = useRiderProfile(session?.user.id);
  // E3 게이트: 로그인 세션 + 승인(APPROVED) 라이더 + 온라인일 때만 발화한다(CallHomePage.tsx:36 참고).
  const enabled = Boolean(session) && rider?.verifyStatus === "APPROVED" && rider?.isOnline === true;

  const [alert, setAlert] = useState<CallAlert | null>(null);
  // Realtime과 FCM foreground의 이중 수신 방지용 orderId별 최근 발화 시각.
  const firedAtRef = useRef(new Map<string, number>());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setAlert(null);
  }, []);

  const fire = useCallback(
    (orderId: string, message: string) => {
      const now = Date.now();
      const last = firedAtRef.current.get(orderId);
      if (last != null && now - last < CALL_ALERT_DISMISS_MS) return; // 이중 수신 dedupe
      firedAtRef.current.set(orderId, now);

      setAlert({ orderId, message });
      if (!mute) playSound();
      // 진동: 미지원 환경(navigator.vibrate 없음) 가드 호출.
      if (vibrate) navigator.vibrate?.(200);

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        setAlert(null);
      }, CALL_ALERT_DISMISS_MS);
    },
    [mute, vibrate, playSound],
  );

  useEffect(() => {
    if (!enabled) return;

    // ① Realtime INSERT 전용 채널(useOpenCalls의 목록 무효화 채널과 분리).
    const channel = supabase
      .channel("pickup_orders_call_alert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pickup_orders" },
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row || row.status !== "REQUESTED") return;
          const orderId = typeof row.id === "string" ? row.id : null;
          if (!orderId) return;
          const address = typeof row.pickup_address === "string" ? row.pickup_address : "";
          const kg = typeof row.requested_kg === "number" ? row.requested_kg : null;
          const summary = [summarizeAddress(address), kg != null ? formatKg(kg) : ""]
            .filter(Boolean)
            .join(" ");
          fire(orderId, summary ? `새 수거 콜 도착 — ${summary}` : "새 수거 콜 도착");
        },
      )
      .subscribe();

    // ② FCM foreground 커스텀 이벤트(push.ts) — 동일 배너, dedupe는 fire가 처리.
    const onPushAlert = (e: Event) => {
      const detail = (e as CustomEvent<{ orderId?: string; title?: string; body?: string }>).detail;
      if (!detail?.orderId) return;
      const message = [detail.title, detail.body].filter(Boolean).join(" — ") || "새 수거 콜 도착";
      fire(detail.orderId, message);
    };
    window.addEventListener(CALL_ALERT_EVENT, onPushAlert);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(CALL_ALERT_EVENT, onPushAlert);
    };
  }, [enabled, fire]);

  // 언마운트 시 잔여 자동 소멸 타이머 정리.
  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    },
    [],
  );

  return { alert, dismiss };
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface RiderLocation {
  lat: number;
  lng: number;
  /** 마지막 좌표 수신 시각(broadcast payload.updatedAt). 60초 무갱신 판정에 사용. */
  updatedAt: string;
  /** 60초 이상 새 좌표가 없으면 true — 지도 마커를 흐리게 표시. */
  stale: boolean;
}

/** 60초 무갱신 시 마커를 흐리게(stale) 표시하는 임계(14 §6). */
const STALE_AFTER_MS = 60_000;

/**
 * [14 J1] 라이더 실시간 위치 구독 — 앱 최초의 broadcast 소비자(기존 훅은 전부 postgres_changes).
 *
 * rider-location Edge가 `order:{orderId}:location` 토픽으로 broadcast하는 좌표를 구독한다.
 * 채널은 private(realtime.messages RLS, 20260724000001) — 주문 당사자만 인가된다. 인가·구독
 * 실패나 좌표 미수신은 조용히 무시(null 반환) → OrderDetailPage가 정적 수거지 마커로 폴백한다
 * (핵심 주문 흐름은 별도 postgres_changes 채널이라 영향 없음).
 *
 * @param active ACCEPTED/ARRIVED처럼 라이더가 이동 중일 때만 true — 그 외에는 구독하지 않는다.
 */
export function useRiderLocation(orderId: string | undefined, active: boolean): RiderLocation | null {
  const [location, setLocation] = useState<RiderLocation | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orderId || !active) {
      setLocation(null);
      return;
    }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const armStaleTimer = () => {
      if (staleTimer.current) clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => {
        setLocation((prev) => (prev ? { ...prev, stale: true } : prev));
      }, STALE_AFTER_MS);
    };

    (async () => {
      // private 채널 인가를 위해 현재 세션 토큰을 Realtime에 주입(best-effort).
      try {
        const { data } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(data.session?.access_token ?? null);
      } catch {
        /* 토큰 주입 실패 시에도 구독은 시도 — 실패하면 폴백(정적 마커) */
      }
      if (cancelled) return;

      channel = supabase
        .channel(`order:${orderId}:location`, { config: { private: true } })
        .on("broadcast", { event: "location" }, (msg) => {
          const p = (msg as { payload?: { lat?: unknown; lng?: unknown; updatedAt?: unknown } }).payload;
          if (typeof p?.lat === "number" && typeof p?.lng === "number") {
            setLocation({
              lat: p.lat,
              lng: p.lng,
              updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
              stale: false,
            });
            armStaleTimer();
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (staleTimer.current) clearTimeout(staleTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [orderId, active]);

  return location;
}

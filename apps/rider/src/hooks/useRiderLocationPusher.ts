import { useEffect } from "react";
import { invokeEdgeFunction } from "../lib/edgeFunction";

/**
 * R4~R6: "운행 중 15초 간격 rider-location Edge Function 호출(Geolocation, 브라우저 권한
 * 없으면 스킵하고 콘솔 경고만 — 크래시 금지)"(태스크 지시사항, 02-api.md rider-location).
 * enabled가 true인 동안(ACCEPTED~PICKED_UP 운행 중)만 동작하며, 언마운트/enabled=false 시
 * interval을 정리한다.
 */
export function useRiderLocationPusher(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn("useRiderLocationPusher: 이 브라우저는 Geolocation을 지원하지 않아요.");
      return;
    }

    function pushOnce() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          invokeEdgeFunction("rider-location", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }).catch((err) => {
            console.warn("useRiderLocationPusher: 위치 전송 실패", err);
          });
        },
        (err) => {
          console.warn("useRiderLocationPusher: 위치 권한을 가져오지 못했어요.", err);
        },
        { enableHighAccuracy: false, timeout: 8000 },
      );
    }

    pushOnce();
    const interval = setInterval(pushOnce, 15_000);
    return () => clearInterval(interval);
  }, [enabled]);
}

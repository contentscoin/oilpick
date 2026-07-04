import { useEffect, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
}

/**
 * 브라우저 Geolocation 1회 조회. 권한이 없거나 API 자체가 없으면(태스크 지시: "브라우저 권한
 * 없으면 스킵하고 콘솔 경고만 — 크래시 금지") null을 유지한 채 콘솔 경고만 남긴다.
 */
export function useGeolocation(enabled: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn("useGeolocation: 이 브라우저는 Geolocation을 지원하지 않아요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("useGeolocation: 위치 권한을 가져오지 못했어요.", err),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [enabled]);

  return position;
}

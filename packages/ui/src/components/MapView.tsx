import { useEffect, useRef, useState } from "react";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — MapView(카카오맵 래퍼).
 *
 * 가정(04-tasks.md 질문 목록에 동일 내용 기록): 이 개발 환경에는 실제 카카오맵 JS SDK
 * API 키가 없다. apiKey를 prop(또는 앱이 import.meta.env.VITE_KAKAO_KEY를 읽어 전달)으로
 * 주입받고, 키가 없거나 SDK 스크립트 로드가 실패하면 크래시 없이 자리표시자 UI를 렌더한다.
 * 실제 SDK가 준비되면(키 주입 + 로드 성공) 컨테이너 div에 카카오맵 인스턴스를 마운트한다.
 */

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (container: HTMLElement, options: Record<string, unknown>) => unknown;
        Marker: new (options: Record<string, unknown>) => { setMap: (map: unknown) => void };
      };
    };
  }
}

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapViewProps {
  apiKey?: string;
  center: { lat: number; lng: number };
  markers?: MapMarker[];
  level?: number;
  className?: string;
  style?: React.CSSProperties;
}

const SDK_SCRIPT_ID = "oilpick-kakao-maps-sdk";

function loadKakaoMapsSdk(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("kakao maps sdk load failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("kakao maps sdk load failed"));
    document.head.appendChild(script);
  });
}

export function MapView({ apiKey, center, markers = [], level = 3, className, style }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "placeholder">("idle");

  useEffect(() => {
    if (!apiKey) {
      setStatus("placeholder");
      return;
    }
    let cancelled = false;
    loadKakaoMapsSdk(apiKey)
      .then(() => {
        if (cancelled) return;
        window.kakao?.maps.load(() => {
          if (cancelled || !containerRef.current) return;
          const kakao = window.kakao;
          if (!kakao) return;
          const map = new kakao.maps.Map(containerRef.current, {
            center: new kakao.maps.LatLng(center.lat, center.lng),
            level,
          });
          markers.forEach((marker) => {
            const markerInstance = new kakao.maps.Marker({
              position: new kakao.maps.LatLng(marker.lat, marker.lng),
            });
            markerInstance.setMap(map);
          });
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("placeholder");
      });
    return () => {
      cancelled = true;
    };
    // center/markers/level은 최초 로드 시점 값만 사용(초기 마운트 1회 렌더) — 이후 변경은
    // 이 SDK 로드 이펙트를 재실행하지 않는다. eslint-plugin-react-hooks가 이 워크스페이스
    // preset에 등록돼 있지 않아 exhaustive-deps 억제 주석은 불필요.
  }, [apiKey]);

  if (status === "placeholder") {
    return (
      <div
        className={className}
        data-testid="map-view-placeholder"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          borderRadius: radius.card,
          backgroundColor: "#e4e4e7",
          color: colors.status.wait,
          fontSize: 14,
          ...style,
        }}
      >
        지도를 표시할 수 없어요 (카카오맵 API 키 필요)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="map-view"
      style={{
        minHeight: 200,
        borderRadius: radius.card,
        backgroundColor: "#e4e4e7",
        ...style,
      }}
    />
  );
}

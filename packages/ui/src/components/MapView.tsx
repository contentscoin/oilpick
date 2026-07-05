import { useEffect, useRef, useState } from "react";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — MapView(카카오맵 래퍼).
 *
 * 가정(04-tasks.md 질문 목록에 동일 내용 기록): 이 개발 환경에는 실제 카카오맵 JS SDK
 * API 키가 없다. apiKey를 prop(또는 앱이 import.meta.env.VITE_KAKAO_KEY를 읽어 전달)으로
 * 주입받고, 키가 없거나 SDK 스크립트 로드가 실패하면 크래시 없이 자리표시자 UI를 렌더한다.
 * 실제 SDK가 준비되면(키 주입 + 로드 성공) 컨테이너 div에 카카오맵 인스턴스를 마운트한다.
 *
 * 키가 없을 때의 자리표시자는 단순 에러 박스가 아니라 "지도 미리보기"로 렌더한다 — 수거지 핀,
 * 라이더(스쿠터) 마커, 경로, ETA/수거지 라벨을 담은 일러스트. 이는 제품 목업(주문 상세)의 지도
 * 영역 디자인을 그대로 보여주기 위한 것이며, 실제 거리/경로/좌표를 반영하지 않는 장식적 프리뷰다.
 * 실제 지도(성수동 등 실거리)와 실시간 경로는 카카오 키 주입 + rider-location 데이터가 있을 때만
 * 렌더된다. etaLabel은 실제 ETA 데이터가 있을 때만 전달할 것(장식 프리뷰에 임의 시간 표기 금지).
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
  /** 키 없을 때 일러스트 지도 프리뷰의 수거지(가게) 라벨. */
  pickupLabel?: string;
  /** 키 없을 때 프리뷰에 표시할 ETA 라벨(예 "12분 후 도착"). 실제 rider-location 데이터가 있을 때만 전달. */
  etaLabel?: string;
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

/** 카카오키 없을 때의 "지도 미리보기" 일러스트(장식용, 실좌표 아님). */
function MapPreview() {
  const green = colors.primary.DEFAULT;
  const amber = colors.accent.DEFAULT;
  return (
    <svg
      viewBox="0 0 340 200"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden
      style={{ position: "absolute", inset: 0, display: "block" }}
    >
      {/* 지면 */}
      <rect x="0" y="0" width="340" height="200" fill="#E9EEEA" />
      {/* 공원(녹지) */}
      <path d="M0 0 H150 V44 Q120 66 70 62 Q20 58 0 78 Z" fill="#D8E8D5" />
      {/* 강(한강 느낌) */}
      <path d="M0 150 Q46 142 66 160 L60 200 L0 200 Z" fill="#CFE2EC" />
      {/* 도로 casing */}
      <g stroke="#DCE1DD" strokeLinecap="round">
        <line x1="-10" y1="112" x2="350" y2="92" strokeWidth="12" />
        <line x1="206" y1="-10" x2="220" y2="210" strokeWidth="11" />
        <line x1="30" y1="210" x2="185" y2="52" strokeWidth="9" />
      </g>
      {/* 도로 */}
      <g stroke="#FFFFFF" strokeLinecap="round">
        <line x1="-10" y1="112" x2="350" y2="92" strokeWidth="8" />
        <line x1="206" y1="-10" x2="220" y2="210" strokeWidth="7" />
        <line x1="30" y1="210" x2="185" y2="52" strokeWidth="5" />
      </g>
      {/* 경로: 수거지(초록) → 라이더(앰버). 완료 구간 green, 남은 구간 amber. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4">
        <polyline points="90,150 90,120 150,120" stroke={green} />
        <polyline points="150,120 150,60 255,60" stroke={amber} strokeDasharray="1 0" />
      </g>
      {/* 수거지 핀(초록 teardrop + 흰 중심) */}
      <g>
        <path
          d="M90 153 C 82 143, 79 140, 79 132 A 11 11 0 1 1 101 132 C 101 140, 98 143, 90 153 Z"
          fill={green}
        />
        <circle cx="90" cy="132" r="4" fill="#fff" />
      </g>
      {/* 라이더(스쿠터) 마커: 흰 링 + 앰버 원 + 흰 스쿠터 글리프 */}
      <g>
        <circle cx="255" cy="60" r="17" fill="#fff" />
        <circle cx="255" cy="60" r="14" fill={amber} />
        <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M249 63 h6 l2 -5 h3" />
          <path d="M251 58 h4" />
        </g>
        <circle cx="250" cy="64" r="2.4" fill="#fff" />
        <circle cx="260" cy="64" r="2.4" fill="#fff" />
      </g>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={colors.primary.DEFAULT} strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke={colors.primary.DEFAULT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MapView({
  apiKey,
  center,
  markers = [],
  level = 3,
  className,
  style,
  pickupLabel,
  etaLabel,
}: MapViewProps) {
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
          position: "relative",
          overflow: "hidden",
          minHeight: 200,
          borderRadius: radius.card,
          border: `1px solid ${surface.border}`,
          boxShadow: elevation.card,
          backgroundColor: "#E9EEEA",
          ...style,
        }}
      >
        <MapPreview />

        {/* ETA pill(실제 ETA 데이터가 있을 때만) */}
        {etaLabel && (
          <span
            data-testid="map-view-eta"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: radius.pill,
              backgroundColor: "#fff",
              boxShadow: elevation.raised,
              fontSize: 14,
              fontWeight: 700,
              color: gray[900],
            }}
          >
            <ClockIcon />
            {etaLabel}
          </span>
        )}

        {/* 수거지 라벨 chip */}
        {pickupLabel && (
          <span
            data-testid="map-view-pickup-label"
            style={{
              position: "absolute",
              left: 14,
              bottom: 14,
              maxWidth: "72%",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: radius.pill,
              backgroundColor: "#fff",
              boxShadow: elevation.card,
              fontSize: 13,
              fontWeight: 700,
              color: gray[900],
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: colors.primary.DEFAULT, flexShrink: 0 }}
            />
            {pickupLabel}
          </span>
        )}
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
        backgroundColor: gray[100],
        ...style,
      }}
    />
  );
}

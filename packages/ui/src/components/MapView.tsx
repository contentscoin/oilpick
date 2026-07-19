import { useEffect, useRef, useState } from "react";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — MapView(MapLibre GL 래퍼).
 * 11-map-renderer.md(M8): 카카오맵 SDK → MapLibre GL(mapcn 패턴) 렌더러 교체.
 *
 * 활성화 게이트: `styleUrl`(앱이 import.meta.env.VITE_MAP_STYLE_URL을 읽어 전달).
 *  - MapLibre 스타일 JSON URL(벡터/래스터 스타일 문서) 또는
 *  - `{z}/{x}/{y}` 래스터 타일 템플릿(예: VWorld WMTS) — 이 경우 인라인 래스터 스타일로 감싼다.
 * 미설정이거나 로드/초기화 실패(WebGL 미지원 포함) 시 크래시 없이 "지도 미리보기" 일러스트를
 * 렌더한다 — 수거지 핀·라이더 마커·경로·ETA/수거지 라벨을 담은 장식적 프리뷰(실좌표 아님).
 * 실제 지도는 styleUrl 주입 시에만 렌더된다. etaLabel은 실제 ETA 데이터가 있을 때만 전달할 것.
 *
 * 한국 커버리지 주의(11-map-renderer.md M5): 글로벌 OSM/CARTO 타일은 국내 도로·라벨이 부실 —
 * 프로덕션은 VWorld(국토부) 타일 권장. maplibre-gl은 dynamic import로 지연 로딩해 styleUrl이
 * 없는 앱/화면의 초기 번들에 포함되지 않는다.
 */

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapViewProps {
  /** MapLibre 스타일 JSON URL 또는 {z}/{x}/{y} 래스터 타일 템플릿. 없으면 프리뷰 폴백. */
  styleUrl?: string;
  center: { lat: number; lng: number };
  markers?: MapMarker[];
  /** 확대 수준 — 카카오 level 호환(1=최대 확대). MapLibre zoom(≈19-level)으로 변환. */
  level?: number;
  className?: string;
  style?: React.CSSProperties;
  /** styleUrl 없을 때 일러스트 지도 프리뷰의 수거지(가게) 라벨. */
  pickupLabel?: string;
  /** 프리뷰에 표시할 ETA 라벨(예 "12분 후 도착"). 실제 rider-location 데이터가 있을 때만 전달. */
  etaLabel?: string;
}

/** {z}/{x}/{y} 템플릿이면 인라인 래스터 스타일로, 아니면 스타일 URL 그대로. */
function resolveStyle(styleUrl: string): string | Record<string, unknown> {
  if (styleUrl.includes("{z}")) {
    return {
      version: 8,
      sources: {
        base: { type: "raster", tiles: [styleUrl], tileSize: 256 },
      },
      layers: [{ id: "base", type: "raster", source: "base" }],
    };
  }
  return styleUrl;
}

/** styleUrl 없을 때의 "지도 미리보기" 일러스트(장식용, 실좌표 아님). */
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
  styleUrl,
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
    if (!styleUrl) {
      setStatus("placeholder");
      return;
    }
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    (async () => {
      try {
        // css는 실지도 경로에서만 로드(프리뷰 폴백 앱은 maplibre 청크 자체를 안 받는다).
        const [{ default: maplibregl }] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !containerRef.current) return;
        map = new maplibregl.Map({
          container: containerRef.current,
          style: resolveStyle(styleUrl) as never,
          center: [center.lng, center.lat],
          zoom: Math.min(19, Math.max(3, 19 - level)),
        });
        markers.forEach((marker) => {
          new maplibregl.Marker({ color: colors.primary.DEFAULT })
            .setLngLat([marker.lng, marker.lat])
            .addTo(map as never);
        });
        setStatus("ready");
      } catch {
        // 모듈 로드 실패·WebGL 미지원 등 — 프리뷰 폴백(크래시 금지)
        if (!cancelled) setStatus("placeholder");
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // center/markers/level은 최초 로드 시점 값만 사용(초기 마운트 1회 렌더) — 이후 변경은
    // 이 로드 이펙트를 재실행하지 않는다(카카오 구현과 동일 계약).
  }, [styleUrl]);

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
        overflow: "hidden",
        backgroundColor: gray[100],
        ...style,
      }}
    />
  );
}

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

/** [14 J1] 라이더 실시간 위치 마커. lat/lng는 최신 좌표, stale=60초 무갱신(흐리게 표시). */
export interface RiderMarker {
  lat: number;
  lng: number;
  stale?: boolean;
}

/** maplibre Marker 인스턴스 중 이 컴포넌트가 쓰는 최소 표면(dynamic import라 구조적 타입만 선언). */
interface RiderMarkerInstance {
  setLngLat: (lngLat: [number, number]) => RiderMarkerInstance;
  addTo: (map: unknown) => RiderMarkerInstance;
  remove?: () => void;
  getElement?: () => HTMLElement | undefined;
}

/** [11 M9-b] 경로선 갱신에 쓰는 maplibre Map의 최소 표면. */
interface MapInstance {
  remove: () => void;
  on?: (ev: string, cb: () => void) => void;
  getSource?: (id: string) => { setData: (d: unknown) => void } | undefined;
  addSource?: (id: string, spec: unknown) => void;
  addLayer?: (spec: unknown) => void;
}

const ROUTE_SOURCE_ID = "oilpick-route";
const ROUTE_LAYER_ID = "oilpick-route-line";

/** 경로 좌표 → GeoJSON LineString Feature. */
function routeGeoJson(path: { lat: number; lng: number }[]) {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: path.map((p) => [p.lng, p.lat]) },
  };
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
  /**
   * [14 J1] 라이더 실시간 위치(useRiderLocation broadcast). 실지도에서는 앰버 마커를 제자리
   * 갱신하고, 프리뷰 폴백에서는 "라이더 이동 중" 라이브 칩을 표시한다. null이면 표시하지 않는다.
   */
  riderMarker?: RiderMarker | null;
  /**
   * [11 M9-b] 라이더→수거지 도로 경로(directions Edge). 실지도에만 선으로 그린다.
   * KAKAO_MOBILITY_KEY 미설정 시 Edge가 빈 배열을 주므로 자연히 미표시(조용한 비활성).
   */
  routePath?: { lat: number; lng: number }[];
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
  riderMarker,
  routePath,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "placeholder">("idle");
  // [11 M9-b] addSource/addLayer는 스타일 로드 완료 후에만 가능하다(status='ready'는 Map 생성
  // 직후라 아직 스타일이 안 붙어 있을 수 있다 — 마커는 무관하지만 레이어는 이 플래그가 필요).
  const [styleLoaded, setStyleLoaded] = useState(false);
  // [14 J1] 라이더 마커를 제자리 갱신하려면 로드 이펙트 밖에서 맵·maplibre 모듈에 접근해야 한다.
  const mapRef = useRef<MapInstance | null>(null);
  const maplibreRef = useRef<{ Marker: new (opts?: Record<string, unknown>) => RiderMarkerInstance } | null>(null);
  const riderMarkerRef = useRef<RiderMarkerInstance | null>(null);

  useEffect(() => {
    if (!styleUrl) {
      setStatus("placeholder");
      return;
    }
    let cancelled = false;
    let map: MapInstance | null = null;
    (async () => {
      try {
        // css는 실지도 경로에서만 로드(프리뷰 폴백 앱은 maplibre 청크 자체를 안 받는다).
        const [{ default: maplibregl }] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !containerRef.current) return;
        // maplibre 실타입 → 이 컴포넌트가 쓰는 최소 표면(MapInstance)으로 좁힌다(dynamic import
        // 라 실타입을 직접 참조하지 않는 기존 관례와 동일).
        map = new maplibregl.Map({
          container: containerRef.current,
          style: resolveStyle(styleUrl) as never,
          center: [center.lng, center.lat],
          zoom: Math.min(19, Math.max(3, 19 - level)),
        }) as unknown as MapInstance;
        markers.forEach((marker) => {
          new maplibregl.Marker({ color: colors.primary.DEFAULT })
            .setLngLat([marker.lng, marker.lat])
            .addTo(map as never);
        });
        const created = map;
        mapRef.current = created;
        maplibreRef.current = maplibregl as never;
        // 스타일 로드 완료 시점을 따로 알린다(경로 레이어 추가 조건).
        created.on?.("load", () => {
          if (!cancelled) setStyleLoaded(true);
        });
        setStatus("ready");
      } catch {
        // 모듈 로드 실패·WebGL 미지원 등 — 프리뷰 폴백(크래시 금지)
        if (!cancelled) setStatus("placeholder");
      }
    })();
    return () => {
      cancelled = true;
      riderMarkerRef.current?.remove?.();
      riderMarkerRef.current = null;
      mapRef.current = null;
      maplibreRef.current = null;
      setStyleLoaded(false);
      map?.remove();
    };
    // center/markers/level은 최초 로드 시점 값만 사용(초기 마운트 1회 렌더) — 이후 변경은
    // 이 로드 이펙트를 재실행하지 않는다(카카오 구현과 동일 계약).
  }, [styleUrl]);

  // [14 J1] 라이더 실시간 마커 — 좌표가 바뀔 때마다 앰버 마커를 제자리 갱신(맵 재로드 없이).
  // riderMarker 미전달 시 no-op(기존 사용처·테스트 무영향). 프리뷰 폴백은 아래 라이브 칩으로 처리.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (status !== "ready" || !map || !maplibre) return;
    if (!riderMarker) {
      riderMarkerRef.current?.remove?.();
      riderMarkerRef.current = null;
      return;
    }
    if (!riderMarkerRef.current) {
      // maplibre Marker는 lngLat이 설정된 뒤에만 addTo할 수 있다 — 순서가 뒤집히면
      // 내부 _update가 미설정 좌표를 읽어 throw(실지도 모드에서 컴포넌트 크래시).
      riderMarkerRef.current = new maplibre.Marker({ color: colors.accent.DEFAULT });
      riderMarkerRef.current.setLngLat([riderMarker.lng, riderMarker.lat]);
      riderMarkerRef.current.addTo(map as never);
    }
    riderMarkerRef.current.setLngLat([riderMarker.lng, riderMarker.lat]);
    const el = riderMarkerRef.current.getElement?.();
    if (el) el.style.opacity = riderMarker.stale ? "0.4" : "1";
  }, [riderMarker, status]);

  // [11 M9-b] 도로 경로선 — 좌표가 바뀌면 소스 데이터만 교체(레이어 재생성 없이).
  // routePath가 비면(키 미설정·라우팅 실패) 빈 LineString으로 지워 선이 남지 않게 한다.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !styleLoaded || !map) return;
    const data = routeGeoJson(routePath ?? []);
    const existing = map.getSource?.(ROUTE_SOURCE_ID);
    if (existing) {
      existing.setData(data);
      return;
    }
    if (!routePath || routePath.length === 0) return; // 그릴 게 없으면 레이어도 만들지 않는다
    map.addSource?.(ROUTE_SOURCE_ID, { type: "geojson", data });
    map.addLayer?.({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colors.primary.DEFAULT, "line-width": 4, "line-opacity": 0.85 },
    });
  }, [routePath, status, styleLoaded]);

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

        {/* [03 레이아웃 강건성] 상단 칩 2개(ETA 좌 / 라이더 라이브 우)를 좌/우 절대배치로 따로
            두면 글자 확대 시 서로 겹친다 — 하나의 절대배치 flex 행으로 묶어 좁으면 행 접힘.
            1x 배치는 동일: ETA 좌측, 라이브 칩은 marginLeft:auto로 우측(단독일 때도 우측). */}
        {(riderMarker || etaLabel) && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              maxWidth: "calc(100% - 24px)",
              width: "calc(100% - 24px)",
              display: "flex",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {/* ETA pill(실제 ETA 데이터가 있을 때만) */}
            {etaLabel && (
              <span
                data-testid="map-view-eta"
                style={{
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

            {/* [14 J1] 라이더 실시간 위치 라이브 칩 — 프리뷰 폴백엔 실좌표 마커가 없으므로 상태로
                대체. 좌표 수신 = "이동 중", 60초 무갱신 = "위치 갱신 대기"(흐리게). */}
            {riderMarker && (
              <span
                data-testid="map-view-rider-live"
                style={{
                  marginLeft: "auto",
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
                  opacity: riderMarker.stale ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: riderMarker.stale ? gray[400] : colors.accent.DEFAULT,
                  }}
                />
                {riderMarker.stale ? "위치 갱신 대기" : "라이더 이동 중"}
              </span>
            )}
          </div>
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

  // 실지도: 컨테이너를 relative 래퍼로 감싸 ETA 칩을 오버레이한다(프리뷰와 동일 위치·톤).
  return (
    <div
      className={className}
      style={{
        position: "relative",
        minHeight: 200,
        borderRadius: radius.card,
        overflow: "hidden",
        backgroundColor: gray[100],
        ...style,
      }}
    >
      <div ref={containerRef} data-testid="map-view" style={{ position: "absolute", inset: 0 }} />
      {/* [11 M9-b] 실 라우팅 ETA만 표시 — 호출부가 durationSeconds 있을 때만 넘긴다. */}
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
    </div>
  );
}

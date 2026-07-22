// 좌표 유틸 — PostGIS geography 파싱 + 길찾기 앱 딥링크 조립(11-map-renderer.md M9-a).
// pickup_orders.pickup_location 등 geography(point,4326) 컬럼은 PostgREST(supabase-js)로
// 읽으면 보통 EWKB hex 문자열로 내려오지만, PostgREST 설정/버전에 따라 GeoJSON
// 객체({type:"Point",coordinates:[lng,lat]})로 오기도 한다. 12-stabilization.md S1:
// 두 형태를 겸용 파싱하는 parseGeographyPoint 하나로 앱 전역을 통일한다(호출부별 중복·
// 죽은 분기·(0,0) 폴백 제거). 클라이언트에서 lat/lng이 필요한 곳(지도 센터·거리·내비)을
// 위해 DB 변경 없이 여기서 파싱한다.

export interface LatLng {
  lat: number;
  lng: number;
}

/** 위/경도 범위 유효성 — 파싱 공통 가드. */
function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const WKB_POINT = 1;
const WKB_SRID_FLAG = 0x20000000;

/**
 * PostGIS EWKB(hex) point → {lat, lng}. point 외 타입·비정상 입력은 null(크래시 금지 —
 * 지도는 폴백 프리뷰로 동작해야 한다). 리틀/빅 엔디언, SRID 유무 모두 허용.
 */
export function parseEwkbPoint(hex: string | null | undefined): LatLng | null {
  if (!hex || typeof hex !== "string" || hex.length < 42 || /[^0-9a-fA-F]/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  const littleEndian = view.getUint8(0) === 1;
  const type = view.getUint32(1, littleEndian);
  if ((type & 0xff) !== WKB_POINT) return null;
  let offset = 5;
  if (type & WKB_SRID_FLAG) offset += 4; // SRID 4바이트 스킵(값 검증은 안 함 — 4326 전제)
  if (bytes.length < offset + 16) return null;
  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/** GeoJSON Point 객체({coordinates:[lng,lat]}) → {lat,lng}. 형태가 아니면 null. */
function parseGeoJsonPoint(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object" || !("coordinates" in raw)) return null;
  const coords = (raw as { coordinates: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/**
 * PostGIS geography(point) 값을 lat/lng으로 파싱한다 — **앱 전역의 단일 진실**(S1).
 * PostgREST가 내려주는 두 형태를 모두 수용한다:
 *  - EWKB/WKB hex 문자열("0101000020E6100000…") → parseEwkbPoint
 *  - GeoJSON Point 객체({type:"Point",coordinates:[lng,lat]})
 * 어느 쪽도 아니거나 좌표가 비정상이면 null(호출부는 "좌표 없음"으로 강등 — (0,0) 폴백 금지).
 */
export function parseGeographyPoint(raw: unknown): LatLng | null {
  if (typeof raw === "string") return parseEwkbPoint(raw);
  return parseGeoJsonPoint(raw);
}

/**
 * 카카오맵 앱 길찾기 스킴 — 설치돼 있으면 목적지가 세팅된 자동차 길안내로 연다.
 * (턴바이턴은 카카오내비/카카오맵이 담당 — 인앱 구현 아님, 11-map-renderer.md M1)
 */
export function buildKakaoRouteUrl(dest: LatLng): string {
  return `kakaomap://route?ep=${dest.lat},${dest.lng}&by=CAR`;
}

/** 카카오맵 웹 길찾기(앱 미설치 폴백) — 이름·좌표를 실은 표준 웹 링크. */
export function buildKakaoWebRouteUrl(name: string, dest: LatLng): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${dest.lat},${dest.lng}`;
}

/** TMap 앱 길찾기 스킴(대안 내비). x=경도, y=위도 순서에 주의. */
export function buildTmapRouteUrl(name: string, dest: LatLng): string {
  return `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${dest.lng}&goaly=${dest.lat}`;
}

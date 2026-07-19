// 좌표 유틸 — PostGIS EWKB 파싱 + 길찾기 앱 딥링크 조립(11-map-renderer.md M9-a).
// pickup_orders.pickup_location 등 geography(point,4326) 컬럼은 PostgREST(supabase-js)로
// 읽으면 EWKB hex 문자열로 내려온다. 클라이언트에서 lat/lng이 필요한 곳(지도 센터·내비
// 딥링크)을 위해 DB 변경 없이 여기서 파싱한다.

export interface LatLng {
  lat: number;
  lng: number;
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
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
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

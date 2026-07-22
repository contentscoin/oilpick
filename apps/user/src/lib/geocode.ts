import { VWORLD_KEY } from "./env";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 주소 문자열 → 좌표(VWorld Geocoder API, 12 S2). 인증키(VWORLD_KEY)가 없거나
 * 네트워크/CORS 실패, status!=OK면 null을 반환한다 — 호출부는 "좌표 미확정"으로 강등해
 * 수동 입력을 받거나 제출을 막는다(기본 좌표 저장 금지).
 *
 * 도로명(road) 우선, 실패 시 지번(parcel)으로 1회 재시도(사용자가 지번을 고른 경우 대비).
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const key = VWORLD_KEY;
  if (!key || !address.trim()) return null;

  for (const type of ["road", "parcel"] as const) {
    try {
      const url =
        `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0` +
        `&crs=epsg:4326&format=json&type=${type}&key=${encodeURIComponent(key)}` +
        `&address=${encodeURIComponent(address)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        response?: { status?: string; result?: { point?: { x?: string; y?: string } } };
      };
      if (json?.response?.status !== "OK") continue;
      const point = json.response.result?.point;
      const lng = Number(point?.x);
      const lat = Number(point?.y);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    } catch {
      // 다음 type 시도, 최종적으로 null
    }
  }
  return null;
}

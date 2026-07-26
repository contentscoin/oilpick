import { invokeEdgeFunction } from "./edgeFunction";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 주소 문자열 → 좌표. **geocode Edge Function을 경유한다**(12 S2 재설계).
 *
 * 이전 구현은 브라우저에서 api.vworld.kr을 직접 호출했는데, VWorld가 CORS 헤더를 주지 않아
 * 프로덕션에서 매번 차단됐다(`No 'Access-Control-Allow-Origin' header`). 즉 주소검색이
 * 좌표를 얻지 못하고 항상 수동 입력으로 떨어졌다. 인증키도 클라이언트 번들에 노출돼
 * 있었다(절대 규칙 3 위반) — 서버측 프록시로 옮겨 둘 다 해소한다.
 *
 * 실패(미구성·주소 미발견·네트워크)는 모두 null. 호출부는 "좌표 미확정"으로 강등해
 * 수동 입력을 받는다(기본 좌표 저장 금지).
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  if (!address.trim()) return null;

  const result = await invokeEdgeFunction<{ configured: boolean; point: GeoPoint | null }>(
    "geocode",
    { address: address.trim() },
  );
  if (!result.ok) return null;
  return result.data.point ?? null;
}

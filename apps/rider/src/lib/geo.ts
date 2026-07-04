/**
 * 두 좌표 간 거리(km) 계산(Haversine). 03-frontend.md apps/rider R2: "거리순 정렬은
 * 클라이언트에서 좌표로 계산" — 표시/정렬용 근사 계산이라 지구 반경만 쓰는 단순 공식으로 충분하다.
 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

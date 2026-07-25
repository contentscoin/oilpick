import { useQuery } from "@tanstack/react-query";
import type { DirectionsOutput, LatLng } from "@oilpick/core";
import { requestDirections } from "../lib/directions";

/**
 * [11 M9-b] 라이더→수거지 도로 경로·ETA 조회.
 *
 * rider-location은 15초마다 좌표를 푸시하므로 좌표가 바뀔 때마다 라우팅을 호출하면 외부 API를
 * 난타하게 된다. 그래서 ① 좌표를 소수 3자리(≈110m)로 절삭해 쿼리 키를 만들고 ② staleTime 60초를
 * 둬, 라이더가 의미 있게 이동했을 때만 재조회한다.
 *
 * origin/destination이 없거나 enabled=false면 호출하지 않는다. Edge에 KAKAO_MOBILITY_KEY가
 * 없으면 `configured:false`+빈 path가 오므로(조용한 비활성) 호출부는 선·ETA를 렌더하지 않는다.
 */
const STALE_MS = 60_000;
/** 좌표 절삭 자릿수 — 3자리 ≈ 110m. 이보다 작은 이동은 같은 쿼리로 취급(재조회 억제). */
const COORD_PRECISION = 3;

const quantize = (n: number) => n.toFixed(COORD_PRECISION);

export function useDirections(
  origin: LatLng | null | undefined,
  destination: LatLng | null | undefined,
  enabled = true,
) {
  const active = Boolean(enabled && origin && destination);

  return useQuery({
    queryKey: [
      "directions",
      origin ? `${quantize(origin.lat)},${quantize(origin.lng)}` : null,
      destination ? `${quantize(destination.lat)},${quantize(destination.lng)}` : null,
    ],
    enabled: active,
    staleTime: STALE_MS,
    // 라우팅은 부가 기능 — 실패해도 지도·주문 흐름을 막지 않는다(재시도 없이 비활성 폴백).
    retry: false,
    queryFn: async (): Promise<DirectionsOutput> => {
      if (!origin || !destination) {
        return { configured: false, distanceMeters: null, durationSeconds: null, path: [] };
      }
      return requestDirections({ origin, destination });
    },
  });
}

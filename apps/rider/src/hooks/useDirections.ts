import { useQuery } from "@tanstack/react-query";
import type { DirectionsOutput, LatLng } from "@oilpick/core";
import { requestDirections } from "../lib/directions";

/**
 * [16 L3 §3-1] 내 위치→수거지 도로 경로·ETA 조회. apps/user useDirections(M9-b)와 동일 계약을
 * 강제한다 — ① 좌표 소수 3자리(≈110m) 절삭 쿼리 키 ② staleTime 60초. CallDetailPage(수락 전)는
 * 열람할 때마다 호출될 수 있어, 이 절삭·캐시가 없으면 콜 상세 다건 연속 열람이 외부 API를
 * 난타한다(16 L-D7 심사 반영). 입출력 타입은 core 공유(DirectionsInput/Output — 규칙 7).
 *
 * origin(내 위치)이 없으면(권한 거부·실패) 호출하지 않는다 — 칩·경로선 미표기 폴백.
 * Edge에 KAKAO_MOBILITY_KEY가 없으면 configured:false+빈 path — 호출부는 렌더하지 않는다.
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
    // 라우팅은 부가 기능 — 실패해도 지도·운행 흐름을 막지 않는다(재시도 없이 비활성 폴백).
    retry: false,
    queryFn: async (): Promise<DirectionsOutput> => {
      if (!origin || !destination) {
        return { configured: false, distanceMeters: null, durationSeconds: null, path: [] };
      }
      return requestDirections({ origin, destination });
    },
  });
}

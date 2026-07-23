import { directionsOutputSchema, type DirectionsInput, type DirectionsOutput } from "@oilpick/core";
import { invokeEdgeFunction } from "./edgeFunction";

/** 라우팅 비활성 기본값 — Edge 미구성(KAKAO_MOBILITY_KEY 없음)·실패 시 경로선 미표시. */
const DISABLED: DirectionsOutput = {
  configured: false,
  distanceMeters: null,
  durationSeconds: null,
  path: [],
};

/**
 * M9-b(11-map-renderer.md): 출발→도착 도로 경로 조회(directions Edge 프록시 → 카카오모빌리티).
 * 서버에 KAKAO_MOBILITY_KEY가 없으면 configured:false로 조용히 비활성된다 — 호출부는 이 값을
 * 보고 경로선을 그리지 않고 라이더 위치 마커만 유지한다. 키가 설정되면 코드 변경 없이 활성화.
 * (현재는 배선만 — 실제 지도 렌더 연결은 M9-b UI 작업에서.)
 */
export async function requestDirections(input: DirectionsInput): Promise<DirectionsOutput> {
  const result = await invokeEdgeFunction<unknown>("directions", input);
  if (!result.ok) return DISABLED;
  const parsed = directionsOutputSchema.safeParse(result.data);
  return parsed.success ? parsed.data : DISABLED;
}

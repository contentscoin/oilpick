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
 * [16 L3 §3-1] 내 위치→수거지 도로 경로 조회(directions Edge 프록시 → 카카오모빌리티).
 * apps/user/src/lib/directions.ts(M9-b 수신측)와 동일 계약 — directions Edge는 인증 사용자
 * 전체 허용이라 라이더 호출에 서버 변경이 없다(11 M9-b "라이더측 수신 UI").
 * 서버에 KAKAO_MOBILITY_KEY가 없으면 configured:false로 조용히 비활성 — 호출부는 경로선·ETA를
 * 렌더하지 않고 기존 직선거리 표기로 폴백한다. 키가 설정되면 코드 변경 없이 활성화.
 */
export async function requestDirections(input: DirectionsInput): Promise<DirectionsOutput> {
  const result = await invokeEdgeFunction<unknown>("directions", input);
  if (!result.ok) return DISABLED;
  const parsed = directionsOutputSchema.safeParse(result.data);
  return parsed.success ? parsed.data : DISABLED;
}

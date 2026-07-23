// directions (M9-b, 11-map-renderer.md / 02-api.md). 출발→도착 도로 경로를 반환한다.
// 카카오모빌리티 Directions API를 프록시한다 — REST 키(KAKAO_MOBILITY_KEY)는 서버 시크릿으로만
// 두고 클라이언트 번들에 노출하지 않는다(CLAUDE.md 규칙 3). 인증된 사용자(점주=라이더 접근
// 관찰 / 라이더=목적지 경로)면 호출 가능.
//
// 키 미설정 시: 200 + { configured: false, path: [] } — 기능이 조용히 비활성된다(호출부는
// 라이더 위치 마커만 표시). 키가 설정되면 별도 배포 없이 즉시 활성화된다.

import { directionsInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

interface KakaoRoute {
  result_code?: number;
  summary?: { distance?: number; duration?: number };
  sections?: { roads?: { vertexes?: number[] }[] }[];
}

/** 카카오모빌리티 응답의 vertexes(평면 [lng,lat,lng,lat,...])를 {lat,lng} 배열로 편다. */
function decodePath(route: KakaoRoute): { lat: number; lng: number }[] {
  const path: { lat: number; lng: number }[] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) {
        path.push({ lng: v[i], lat: v[i + 1] });
      }
    }
  }
  return path;
}

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    try {
      await requireAuth(req); // 인증만 요구(역할 무관 — 점주/라이더 모두 경로 조회 가능)
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }

    const body = await req.json().catch(() => null);
    const parsed = directionsInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", 400, "출발/도착 좌표가 올바르지 않아요.");
    }
    const { origin, destination } = parsed.data;

    const apiKey = Deno.env.get("KAKAO_MOBILITY_KEY");
    if (!apiKey) {
      // 키 미설정 — 기능 비활성(에러 아님). 호출부는 라이더 위치만 표시한다.
      return okResponse({ configured: false, distanceMeters: null, durationSeconds: null, path: [] });
    }

    const url =
      `${KAKAO_DIRECTIONS_URL}?origin=${origin.lng},${origin.lat}` +
      `&destination=${destination.lng},${destination.lat}&priority=RECOMMEND`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (!res.ok) {
      // 상류 실패는 경로 없음으로 강등(지도·마커는 계속 동작).
      return okResponse({ configured: true, distanceMeters: null, durationSeconds: null, path: [] });
    }

    const json = (await res.json()) as { routes?: KakaoRoute[] };
    const route = json.routes?.[0];
    // result_code 0 = 정상. 그 외(길 없음 등)는 경로 없음으로 강등.
    if (!route || (route.result_code != null && route.result_code !== 0)) {
      return okResponse({ configured: true, distanceMeters: null, durationSeconds: null, path: [] });
    }

    return okResponse({
      configured: true,
      distanceMeters: route.summary?.distance ?? null,
      durationSeconds: route.summary?.duration ?? null,
      path: decodePath(route),
    });
  })
);

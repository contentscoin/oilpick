// geocode (12 S2 재설계, 02-api.md). 주소 문자열 → 좌표를 반환한다.
// VWorld Geocoder API를 프록시한다 — 인증키(VWORLD_KEY)는 서버 시크릿으로만 두고 클라이언트
// 번들에 노출하지 않는다(CLAUDE.md 규칙 3). directions와 동일한 패턴.
//
// 왜 서버측인가: 브라우저에서 api.vworld.kr을 직접 부르면 **CORS로 차단된다**
// (`No 'Access-Control-Allow-Origin' header`). 프로덕션에서 주소검색이 좌표를 못 얻어
// 매번 수동 입력으로 떨어지던 원인이다. 덤으로 키 노출도 함께 해소된다.
//
// 키 미설정 시: 200 + { configured: false, point: null } — 기능이 조용히 비활성된다
// (호출부는 수동 좌표 입력을 연다). 키가 설정되면 별도 배포 없이 즉시 활성화된다.

import { geocodeInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

const VWORLD_URL = "https://api.vworld.kr/req/address";

interface VWorldResponse {
  response?: { status?: string; result?: { point?: { x?: string; y?: string } } };
}

/** 도로명(road) 우선, 실패 시 지번(parcel) 1회 재시도(사용자가 지번을 고른 경우 대비). */
async function lookup(address: string, key: string): Promise<{ lat: number; lng: number } | null> {
  for (const type of ["road", "parcel"] as const) {
    try {
      const url =
        `${VWORLD_URL}?service=address&request=getcoord&version=2.0` +
        `&crs=epsg:4326&format=json&type=${type}&key=${encodeURIComponent(key)}` +
        `&address=${encodeURIComponent(address)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as VWorldResponse;
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

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    try {
      await requireAuth(req); // 인증만 요구(역할 무관 — 점주가 매장 주소를 등록한다)
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }

    const body = await req.json().catch(() => null);
    const parsed = geocodeInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, "주소를 확인해주세요.");
    }

    const apiKey = Deno.env.get("VWORLD_KEY");
    if (!apiKey) {
      // 키 미설정 — 기능 비활성(에러 아님). 호출부는 수동 좌표 입력으로 강등한다.
      return okResponse({ configured: false, point: null });
    }

    return okResponse({ configured: true, point: await lookup(parsed.data.address, apiKey) });
  })
);

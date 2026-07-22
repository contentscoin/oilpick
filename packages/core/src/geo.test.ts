import { describe, expect, it } from "vitest";
import {
  buildKakaoRouteUrl,
  buildKakaoWebRouteUrl,
  buildTmapRouteUrl,
  parseEwkbPoint,
  parseGeographyPoint,
} from "./geo";

// PostGIS: select encode(ST_AsEWKB(ST_SetSRID(ST_MakePoint(126.8225, 37.5509), 4326)), 'hex')
const SEOUL_EWKB = "0101000020E6100000713D0AD7A3B45F40E6AE25E483C64240";

describe("parseEwkbPoint", () => {
  it("SRID 포함 리틀엔디언 EWKB point를 파싱한다", () => {
    const p = parseEwkbPoint(SEOUL_EWKB);
    expect(p).not.toBeNull();
    expect(p!.lng).toBeCloseTo(126.8225, 4);
    expect(p!.lat).toBeCloseTo(37.5509, 4);
  });

  it("SRID 없는 WKB point도 파싱한다", () => {
    // ST_AsBinary(ST_MakePoint(127.0, 37.5)) — SRID 플래그 없음, 리틀엔디언
    const hex = "0101000000" + "0000000000C05F40" + "0000000000C04240";
    const p = parseEwkbPoint(hex);
    expect(p).not.toBeNull();
    expect(p!.lng).toBeCloseTo(127.0, 6);
    expect(p!.lat).toBeCloseTo(37.5, 6);
  });

  it("비정상 입력은 null(크래시 금지)", () => {
    expect(parseEwkbPoint(null)).toBeNull();
    expect(parseEwkbPoint(undefined)).toBeNull();
    expect(parseEwkbPoint("")).toBeNull();
    expect(parseEwkbPoint("zz11")).toBeNull();
    expect(parseEwkbPoint("0101")).toBeNull(); // 너무 짧음
    // point가 아닌 타입(linestring=2)
    expect(parseEwkbPoint("0102000020E6100000" + "00".repeat(20))).toBeNull();
  });

  it("좌표 범위 밖(lat>90)은 null", () => {
    // lat=95로 조작한 EWKB
    const bad = "0101000020E6100000" + "0000000000C05F40" + "0000000000C05740"; // lng=127, lat=95
    expect(parseEwkbPoint(bad)).toBeNull();
  });
});

describe("parseGeographyPoint (12 S1 — hex·GeoJSON 겸용 단일 파서)", () => {
  it("WKB hex 문자열을 파싱한다(PostgREST 실측 형태)", () => {
    const p = parseGeographyPoint(SEOUL_EWKB);
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(37.5509, 4);
    expect(p!.lng).toBeCloseTo(126.8225, 4);
  });

  it("GeoJSON Point 객체를 파싱한다({coordinates:[lng,lat]})", () => {
    const p = parseGeographyPoint({ type: "Point", coordinates: [126.8225, 37.5509] });
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(37.5509, 6);
    expect(p!.lng).toBeCloseTo(126.8225, 6);
  });

  it("비정상 입력·범위 밖은 null(크래시·(0,0) 폴백 금지)", () => {
    expect(parseGeographyPoint(null)).toBeNull();
    expect(parseGeographyPoint(undefined)).toBeNull();
    expect(parseGeographyPoint({})).toBeNull();
    expect(parseGeographyPoint({ coordinates: [999, 999] })).toBeNull();
    expect(parseGeographyPoint({ coordinates: [126] })).toBeNull();
    expect(parseGeographyPoint("nothex")).toBeNull();
  });
});

describe("길찾기 딥링크 빌더 (M9-a)", () => {
  const dest = { lat: 37.5509, lng: 126.8225 };

  it("카카오맵 앱 스킴에 목적지 좌표를 싣는다", () => {
    expect(buildKakaoRouteUrl(dest)).toBe("kakaomap://route?ep=37.5509,126.8225&by=CAR");
  });

  it("카카오맵 웹 폴백 링크(이름 인코딩)", () => {
    expect(buildKakaoWebRouteUrl("행복식당 마곡점", dest)).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent("행복식당 마곡점")},37.5509,126.8225`,
    );
  });

  it("TMap 스킴은 x=경도 y=위도", () => {
    const url = buildTmapRouteUrl("행복식당", dest);
    expect(url).toContain("goalx=126.8225");
    expect(url).toContain("goaly=37.5509");
  });
});

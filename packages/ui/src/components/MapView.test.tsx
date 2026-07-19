import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapView } from "./MapView";

// 11 M8 — MapLibre 렌더러. jsdom엔 WebGL이 없으므로 maplibre-gl을 모킹해
// "게이트(styleUrl) 분기 + 초기화 계약 + 실패 폴백"만 검증한다.

const { MockMap, MockMarker, mapCtorArgs } = vi.hoisted(() => {
  const mapCtorArgs: Record<string, unknown>[] = [];
  class MockMap {
    constructor(options: Record<string, unknown>) {
      mapCtorArgs.push(options);
    }
    remove() {}
  }
  class MockMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  return { MockMap, MockMarker, mapCtorArgs };
});

vi.mock("maplibre-gl", () => ({ default: { Map: MockMap, Marker: MockMarker } }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

describe("MapView (MapLibre)", () => {
  beforeEach(() => {
    mapCtorArgs.length = 0;
  });

  it("styleUrl이 없으면 프리뷰 폴백을 렌더한다(크래시 금지)", () => {
    render(<MapView center={{ lat: 37.5665, lng: 126.978 }} pickupLabel="행복식당" />);
    expect(screen.getByTestId("map-view-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("map-view-pickup-label")).toHaveTextContent("행복식당");
  });

  it("styleUrl이 있으면 MapLibre 맵을 [lng,lat] 센터로 초기화한다", async () => {
    render(
      <MapView
        styleUrl="https://tiles.example/style.json"
        center={{ lat: 37.5509, lng: 126.8225 }}
        markers={[{ lat: 37.5509, lng: 126.8225 }]}
        level={3}
      />,
    );
    await waitFor(() => expect(mapCtorArgs).toHaveLength(1));
    expect(mapCtorArgs[0]!.center).toEqual([126.8225, 37.5509]);
    expect(mapCtorArgs[0]!.zoom).toBe(16); // 카카오 level 3 → zoom 19-3
    expect(mapCtorArgs[0]!.style).toBe("https://tiles.example/style.json");
    expect(screen.getByTestId("map-view")).toBeInTheDocument();
  });

  it("{z}/{x}/{y} 래스터 템플릿은 인라인 래스터 스타일로 감싼다", async () => {
    render(
      <MapView
        styleUrl="https://tiles.example/{z}/{x}/{y}.png"
        center={{ lat: 37.5, lng: 127 }}
      />,
    );
    await waitFor(() => expect(mapCtorArgs).toHaveLength(1));
    const style = mapCtorArgs[0]!.style as { sources: { base: { tiles: string[] } } };
    expect(style.sources.base.tiles).toEqual(["https://tiles.example/{z}/{x}/{y}.png"]);
  });

  it("맵 초기화가 던지면 프리뷰 폴백으로 내려간다(WebGL 미지원 등)", async () => {
    const mod = await import("maplibre-gl");
    const realMap = (mod.default as { Map: unknown }).Map;
    (mod.default as { Map: unknown }).Map = function () {
      throw new Error("no webgl");
    };
    try {
      render(<MapView styleUrl="https://tiles.example/style.json" center={{ lat: 37.5, lng: 127 }} />);
      expect(await screen.findByTestId("map-view-placeholder")).toBeInTheDocument();
    } finally {
      (mod.default as { Map: unknown }).Map = realMap;
    }
  });
});

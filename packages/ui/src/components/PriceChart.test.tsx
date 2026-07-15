import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PriceChart, type PriceChartPoint } from "./PriceChart";
import { colors } from "../tokens";

// jsdom(25)은 PointerEvent를 구현하지 않는다 — fireEvent.pointer* 용 최소 폴리필.
if (typeof window.PointerEvent === "undefined") {
  // @ts-expect-error 테스트 폴리필: MouseEvent가 clientX를 제공한다.
  window.PointerEvent = class extends MouseEvent {};
}

const RISING: PriceChartPoint[] = [
  { date: "2026-07-06", price: 700 },
  { date: "2026-07-07", price: 710 },
  { date: "2026-07-08", price: 730 },
];

const FALLING: PriceChartPoint[] = [
  { date: "2026-07-06", price: 730 },
  { date: "2026-07-07", price: 710 },
  { date: "2026-07-08", price: 700 },
];

function stubRect(el: Element, width = 340) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 180,
    width,
    height: 180,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

describe("PriceChart", () => {
  it("renders the line and gradient area for >=2 points", () => {
    render(<PriceChart data={RISING} />);
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-line")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-area")).toBeInTheDocument();
  });

  it("stroke color follows 등락 direction (rising=up token, falling=down token)", () => {
    const { rerender } = render(<PriceChart data={RISING} />);
    expect(screen.getByTestId("price-chart-line")).toHaveAttribute("stroke", colors.up);
    rerender(<PriceChart data={FALLING} />);
    expect(screen.getByTestId("price-chart-line")).toHaveAttribute("stroke", colors.down);
  });

  it("stroke prop overrides the trend color (다크 히어로 민트 주입)", () => {
    render(<PriceChart data={RISING} stroke={colors.chart.lineOnDark} />);
    expect(screen.getByTestId("price-chart-line")).toHaveAttribute("stroke", colors.chart.lineOnDark);
  });

  it("returns null (renders nothing) with fewer than 2 points", () => {
    const { container } = render(<PriceChart data={[{ date: "2026-07-08", price: 700 }]} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });

  it("calls onScrub with the nearest point on pointer move and clears on leave", () => {
    const onScrub = vi.fn();
    render(<PriceChart data={RISING} onScrub={onScrub} />);
    const svg = screen.getByTestId("price-chart");
    stubRect(svg, 340);

    // clientX=340 → ratio 1 → 마지막 인덱스(2).
    fireEvent.pointerMove(svg, { clientX: 340 });
    expect(onScrub).toHaveBeenLastCalledWith(RISING[2]);
    expect(screen.getByTestId("price-chart-tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-guideline")).toBeInTheDocument();

    // clientX=0 → ratio 0 → 인덱스 0.
    fireEvent.pointerMove(svg, { clientX: 0 });
    expect(onScrub).toHaveBeenLastCalledWith(RISING[0]);

    fireEvent.pointerLeave(svg);
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId("price-chart-tooltip")).not.toBeInTheDocument();
  });

  it("[08 G4] v2: 기간 최고/최저 마커와 마지막 값 펄스 도트를 렌더한다", () => {
    render(<PriceChart data={RISING} />);
    expect(screen.getByTestId("price-chart-extremes")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-pulse")).toBeInTheDocument();
    // 최고 730 / 최저 700 라벨.
    expect(screen.getByText("730원")).toBeInTheDocument();
    expect(screen.getByText("700원")).toBeInTheDocument();
  });

  it("[08 G4] v2: showExtremes=false·pulse=false로 끌 수 있다(하위호환)", () => {
    render(<PriceChart data={RISING} showExtremes={false} pulse={false} />);
    expect(screen.queryByTestId("price-chart-extremes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("price-chart-pulse")).not.toBeInTheDocument();
  });

  it("[08 G4] v2: showGrid=true면 y축 가이드 3선을 렌더한다(기본 off)", () => {
    const { rerender } = render(<PriceChart data={RISING} />);
    expect(screen.queryByTestId("price-chart-grid")).not.toBeInTheDocument();
    rerender(<PriceChart data={RISING} showGrid />);
    expect(screen.getByTestId("price-chart-grid")).toBeInTheDocument();
  });

  it("[08 G4] v2: 스크럽 툴팁에 전일 대비를 병기한다(첫 점은 생략)", () => {
    render(<PriceChart data={RISING} />);
    const svg = screen.getByTestId("price-chart");
    stubRect(svg, 340);

    // 마지막 점(730): 전일(710) 대비 ▲20원.
    fireEvent.pointerMove(svg, { clientX: 340 });
    expect(screen.getByTestId("price-chart-tooltip-diff")).toHaveTextContent("전일 대비 ▲20원");

    // 첫 점: 전일이 없어 diff 미표시.
    fireEvent.pointerMove(svg, { clientX: 0 });
    expect(screen.queryByTestId("price-chart-tooltip-diff")).not.toBeInTheDocument();
  });

  it("[08 G4] v2: 소극 스무딩 기본(on) — 곡선(C) 세그먼트, smooth=false면 폴리라인(L)", () => {
    const { rerender } = render(<PriceChart data={RISING} />);
    expect(screen.getByTestId("price-chart-line").getAttribute("d")).toContain("C");
    rerender(<PriceChart data={RISING} smooth={false} />);
    expect(screen.getByTestId("price-chart-line").getAttribute("d")).not.toContain("C");
  });

  it("respects prefers-reduced-motion: no draw-in transition, dashoffset 0", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(<PriceChart data={RISING} />);
    const line = screen.getByTestId("price-chart-line");
    expect(line).toHaveAttribute("stroke-dashoffset", "0");
    expect(line.style.transition).toBe("none");
  });
});

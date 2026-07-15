import { useEffect, useId, useMemo, useState } from "react";
import { formatKrw } from "@oilpick/core";
import { colors, gray, motion, surfaceDark } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * 08-payout-pivot.md G4 — 일별 시세 라인 차트 v2(순수 SVG, 라이브러리 금지).
 * 07 F7 1세대(라인+영역+스크럽+드로인)를 하위호환으로 유지하면서 고도화:
 *   - 소극 스무딩: Catmull-Rom → cubic bezier(감쇠 1/6) — 등락 방향을 왜곡하지 않는 완만한 곡선
 *     (`smooth=false`로 1세대 폴리라인 유지 가능)
 *   - 기간 최고/최저 마커(점 + 금액 라벨) — `showExtremes`
 *   - y축 눈금 가이드 3선(최고/중간/최저 + 우측 금액 라벨) — `showGrid`(기본 off, 상세 화면용)
 *   - 마지막 값 펄스 도트(2s 링 확산, reduced-motion 시 정지) — `pulse`
 *   - 스크럽 툴팁에 전일 대비(▲/▼) 병기
 * 데이터 2점 미만이면 null(빈 상태는 소비처 책임).
 */
export interface PriceChartPoint {
  /** KST 날짜(YYYY-MM-DD). resampleDaily(@oilpick/core) 출력과 호환. */
  date: string;
  /** 매입가(원/kg). */
  price: number;
}

export interface PriceChartProps {
  data: PriceChartPoint[];
  /** 스크럽 중인 점(또는 스크럽 종료 시 null). 히어로 상단 숫자 치환에 사용. */
  onScrub?: (point: PriceChartPoint | null) => void;
  /** 라인 stroke 색 override. 미지정 시 등락 방향(up/down 토큰)으로 결정. */
  stroke?: string;
  /** 영역 그라디언트 상단 색 override(다크 히어로는 colors.chart.areaTop). 미지정 시 stroke 파생. */
  areaColor?: string;
  /** true면 툴팁·가이드 텍스트를 다크 히어로용(밝은 색)으로 렌더. */
  onDark?: boolean;
  /** 소극 스무딩(Catmull-Rom→bezier). 기본 true — v1 폴리라인은 false. */
  smooth?: boolean;
  /** 기간 최고/최저 마커. 기본 true. */
  showExtremes?: boolean;
  /** y축 눈금 가이드 3선(상세 화면용). 기본 false — 히어로는 미니멀 유지. */
  showGrid?: boolean;
  /** 마지막 값 펄스 도트. 기본 true(reduced-motion 시 정적 점만). */
  pulse?: boolean;
  className?: string;
  /** role="img" aria-label. 미지정 시 기간·현재가·최고/최저로 자동 생성. */
  ariaLabel?: string;
}

const VIEW_W = 340;
const VIEW_H = 180;
const PAD_X = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const PLOT_W = VIEW_W - PAD_X * 2;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const BASELINE_Y = PAD_TOP + PLOT_H;
const DRAW_MS = 600;

/** "YYYY-MM-DD" → "M/D". */
function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
}

interface Coord {
  x: number;
  y: number;
}

/**
 * Catmull-Rom → cubic bezier 변환(감쇠 1/6). 이웃점 기울기로 제어점을 잡아
 * 통과점(데이터 값)은 그대로 유지한다 — 값 왜곡 없는 "소극" 스무딩.
 */
function smoothLinePath(coords: Coord[]): string {
  if (coords.length < 3) {
    return coords.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  }
  const parts = [`M${coords[0]!.x.toFixed(2)},${coords[0]!.y.toFixed(2)}`];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] ?? coords[i]!;
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const p3 = coords[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

export function PriceChart({
  data,
  onScrub,
  stroke,
  areaColor,
  onDark = false,
  smooth = true,
  showExtremes = true,
  showGrid = false,
  pulse = true,
  className,
  ariaLabel,
}: PriceChartProps) {
  const gradientId = useId();
  const reduce = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reduce);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (reduce) {
      setDrawn(true);
      return;
    }
    // 초기 렌더(dashoffset=length)를 한 프레임 그린 뒤 0으로 전이시켜 드로인.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduce]);

  const geom = useMemo(() => {
    if (data.length < 2) return null;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const coords: Coord[] = data.map((d, i) => {
      const x = PAD_X + (data.length === 1 ? 0 : PLOT_W * (i / (data.length - 1)));
      const y = PAD_TOP + PLOT_H * (1 - (d.price - min) / range);
      return { x, y };
    });
    const line = smooth
      ? smoothLinePath(coords)
      : coords.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${coords[coords.length - 1]!.x.toFixed(2)},${BASELINE_Y} L${coords[0]!.x.toFixed(2)},${BASELINE_Y} Z`;
    // 드로인 dash 길이: 폴리라인 길이 기반 + 스무딩 여유(과대 추정은 안전 — jsdom엔 getTotalLength 없음).
    const length =
      coords.reduce(
        (acc, c, i) => (i === 0 ? 0 : acc + Math.hypot(c.x - coords[i - 1]!.x, c.y - coords[i - 1]!.y)),
        0,
      ) * (smooth ? 1.15 : 1);
    const minIndex = prices.indexOf(min);
    const maxIndex = prices.indexOf(max);
    return { coords, line, area, length, min, max, minIndex, maxIndex };
  }, [data, smooth]);

  if (!geom) return null;

  const trendUp = data[data.length - 1]!.price >= data[0]!.price;
  const lineColor = stroke ?? (trendUp ? colors.up : colors.down);
  const fillTop = areaColor ?? lineColor;

  const active = activeIndex != null ? geom.coords[activeIndex] : null;
  const activePoint = activeIndex != null ? data[activeIndex] : null;
  const activePrev = activeIndex != null && activeIndex > 0 ? data[activeIndex - 1] : null;

  function handleScrub(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return; // jsdom 기본값 방어 / 레이아웃 전.
    const ratio = (event.clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, ratio));
    const idx = Math.round(clamped * (data.length - 1));
    setActiveIndex(idx);
    onScrub?.(data[idx]!);
  }

  function clearScrub() {
    if (activeIndex == null) return;
    setActiveIndex(null);
    onScrub?.(null);
  }

  const autoLabel =
    `최근 ${data.length}일 시세 추이, 현재 ${formatKrw(data[data.length - 1]!.price)}/kg, ` +
    `기간 최고 ${formatKrw(geom.max)} 최저 ${formatKrw(geom.min)}`;
  const tooltipText = onDark ? surfaceDark.textOnDark : colors.status.done;
  const guideColor = onDark ? surfaceDark.textOnDarkMuted : colors.status.wait;
  const gridLine = onDark ? "rgba(255,255,255,0.10)" : gray[200];
  const markerLabel = onDark ? surfaceDark.textOnDarkMuted : gray[500];
  const lastCoord = geom.coords[geom.coords.length - 1]!;

  // 최고/최저 마커 라벨 x 클램프(뷰박스 밖 잘림 방지).
  const clampLabelX = (x: number) => Math.max(PAD_X + 16, Math.min(VIEW_W - PAD_X - 16, x));

  return (
    <svg
      className={className}
      data-testid="price-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? autoLabel}
      /* SVG 속성 height는 길이만 허용("auto"는 콘솔 에러) — 비율 유지는 CSS height:auto로. */
      style={{ display: "block", height: "auto", touchAction: "pan-y" }}
      onPointerDown={handleScrub}
      onPointerMove={handleScrub}
      onPointerUp={clearScrub}
      onPointerLeave={clearScrub}
      onPointerCancel={clearScrub}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} stopOpacity={0.18} />
          <stop offset="100%" stopColor={fillTop} stopOpacity={0} />
        </linearGradient>
      </defs>

      {showGrid && (
        <g data-testid="price-chart-grid" pointerEvents="none">
          {[
            { y: PAD_TOP, value: geom.max },
            { y: PAD_TOP + PLOT_H / 2, value: Math.round((geom.max + geom.min) / 2) },
            { y: BASELINE_Y, value: geom.min },
          ].map(({ y, value }) => (
            <g key={y}>
              <line x1={PAD_X} y1={y} x2={VIEW_W - PAD_X} y2={y} stroke={gridLine} strokeWidth={1} strokeDasharray="2 4" />
              <text
                x={VIEW_W - PAD_X}
                y={y - 4}
                textAnchor="end"
                fontSize={9}
                fill={markerLabel}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatKrw(value)}
              </text>
            </g>
          ))}
        </g>
      )}

      <path data-testid="price-chart-area" d={geom.area} fill={`url(#${gradientId})`} stroke="none" />

      <path
        data-testid="price-chart-line"
        d={geom.line}
        fill="none"
        stroke={lineColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={geom.length}
        strokeDashoffset={drawn ? 0 : geom.length}
        style={{ transition: reduce ? "none" : `stroke-dashoffset ${DRAW_MS}ms ${motion.ease}` }}
      />

      {showExtremes && geom.max !== geom.min && (
        <g data-testid="price-chart-extremes" pointerEvents="none">
          {/* 최고 — 점 위 라벨 */}
          <circle cx={geom.coords[geom.maxIndex]!.x} cy={geom.coords[geom.maxIndex]!.y} r={2.5} fill={lineColor} />
          <text
            x={clampLabelX(geom.coords[geom.maxIndex]!.x)}
            y={Math.max(9, geom.coords[geom.maxIndex]!.y - 7)}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={markerLabel}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatKrw(geom.max)}
          </text>
          {/* 최저 — 점 아래 라벨 */}
          <circle cx={geom.coords[geom.minIndex]!.x} cy={geom.coords[geom.minIndex]!.y} r={2.5} fill={lineColor} />
          <text
            x={clampLabelX(geom.coords[geom.minIndex]!.x)}
            y={Math.min(VIEW_H - 3, geom.coords[geom.minIndex]!.y + 14)}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={markerLabel}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatKrw(geom.min)}
          </text>
        </g>
      )}

      {pulse && (
        <g data-testid="price-chart-pulse" pointerEvents="none">
          {!reduce && (
            <circle
              className="oilpick-chart-pulse"
              cx={lastCoord.x}
              cy={lastCoord.y}
              r={4}
              fill="none"
              stroke={lineColor}
              strokeWidth={1.5}
            />
          )}
          <circle cx={lastCoord.x} cy={lastCoord.y} r={3.5} fill={lineColor} stroke={onDark ? surfaceDark.heroDeep : "#fff"} strokeWidth={1.5} />
        </g>
      )}

      {active && activePoint && (
        <g data-testid="price-chart-scrub" pointerEvents="none">
          <line
            data-testid="price-chart-guideline"
            x1={active.x}
            y1={PAD_TOP}
            x2={active.x}
            y2={BASELINE_Y}
            stroke={guideColor}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle cx={active.x} cy={active.y} r={3.5} fill={lineColor} stroke="#fff" strokeWidth={1.5} />
          {(() => {
            const diff = activePrev ? activePoint.price - activePrev.price : null;
            const diffText =
              diff == null ? null : diff === 0 ? "보합" : `${diff > 0 ? "▲" : "▼"}${formatKrw(Math.abs(diff))}`;
            const diffColor = diff == null || diff === 0 ? guideColor : diff > 0 ? colors.up : colors.down;
            const boxW = 96;
            const boxH = diffText ? 52 : 38;
            const bx = Math.max(2, Math.min(VIEW_W - boxW - 2, active.x - boxW / 2));
            return (
              <g data-testid="price-chart-tooltip" transform={`translate(${bx}, 2)`}>
                <rect
                  width={boxW}
                  height={boxH}
                  rx={8}
                  fill={onDark ? surfaceDark.heroDeep : "#fff"}
                  fillOpacity={onDark ? 0.92 : 0.96}
                  stroke={onDark ? "rgba(255,255,255,0.18)" : colors.status.wait}
                  strokeOpacity={onDark ? 1 : 0.25}
                />
                <text x={boxW / 2} y={15} textAnchor="middle" fontSize={11} fill={guideColor}>
                  {shortDate(activePoint.date)}
                </text>
                <text
                  x={boxW / 2}
                  y={30}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill={tooltipText}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatKrw(activePoint.price)}
                </text>
                {diffText && (
                  <text
                    data-testid="price-chart-tooltip-diff"
                    x={boxW / 2}
                    y={45}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={diffColor}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    전일 대비 {diffText}
                  </text>
                )}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

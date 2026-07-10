import { useEffect, useId, useMemo, useState } from "react";
import { formatKrw } from "@oilpick/core";
import { colors, motion, surfaceDark } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * 07-pivot-plan.md F7-④ — 일별 시세 라인 차트(순수 SVG, 라이브러리 금지).
 * PriceCard의 Sparkline 좌표 패턴(PriceCard.tsx:20-67)을 확장한 것:
 *   - 라인 <path> + <linearGradient> 영역(상단 .18 → 하단 0)
 *   - viewBox 340×180, width 100% 반응형
 *   - 등락 방향이 stroke 색 지배(기본 colors.up/down; 다크 히어로는 stroke prop으로 민트 주입)
 *   - 포인터 스크럽(세로 가이드 + 날짜·값 툴팁 + onScrub 콜백 — 히어로 숫자 치환용)
 *   - 마운트 드로인(stroke-dashoffset), prefers-reduced-motion 시 즉시
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
  /** true면 툴팁 텍스트를 다크 히어로용(밝은 색)으로 렌더. */
  onDark?: boolean;
  className?: string;
  /** role="img" aria-label. 미지정 시 기간·현재가로 자동 생성. */
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

export function PriceChart({
  data,
  onScrub,
  stroke,
  areaColor,
  onDark = false,
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
    const coords = data.map((d, i) => {
      const x = PAD_X + (data.length === 1 ? 0 : PLOT_W * (i / (data.length - 1)));
      const y = PAD_TOP + PLOT_H * (1 - (d.price - min) / range);
      return { x, y };
    });
    const line = coords.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${coords[coords.length - 1]!.x.toFixed(2)},${BASELINE_Y} L${coords[0]!.x.toFixed(2)},${BASELINE_Y} Z`;
    const length = coords.reduce(
      (acc, c, i) => (i === 0 ? 0 : acc + Math.hypot(c.x - coords[i - 1]!.x, c.y - coords[i - 1]!.y)),
      0,
    );
    return { coords, line, area, length };
  }, [data]);

  if (!geom) return null;

  const trendUp = data[data.length - 1]!.price >= data[0]!.price;
  const lineColor = stroke ?? (trendUp ? colors.up : colors.down);
  const fillTop = areaColor ?? lineColor;

  const active = activeIndex != null ? geom.coords[activeIndex] : null;
  const activePoint = activeIndex != null ? data[activeIndex] : null;

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

  const autoLabel = `최근 ${data.length}일 시세 추이, 현재 ${formatKrw(data[data.length - 1]!.price)}원/kg`;
  const tooltipText = onDark ? surfaceDark.textOnDark : colors.status.done;
  const guideColor = onDark ? surfaceDark.textOnDarkMuted : colors.status.wait;

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
            const boxW = 88;
            const boxH = 38;
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
                  {formatKrw(activePoint.price)}원
                </text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

import { formatKrw } from "@oilpick/core";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PriceCard(현재가+등락+스파크라인).
 * 시세 그래프 본체(recharts, /price 상세 페이지)와 달리 이 카드의 스파크라인은
 * 작은 인라인 SVG 추세선이다 — 03-frontend.md "차트" 절의 recharts 지정은
 * "시세 그래프"(U4 상세 화면)에 대한 것으로, 홈 카드의 미니 스파크라인은 대상이 아니다.
 */
export interface PriceCardProps {
  /** 현재가(원/kg). */
  pricePerKg: number;
  /** 직전 대비 변동폭(원). 양수=상승, 음수=하락, 0=보합. */
  changeAmount: number;
  /** 최근 시세 이력(오래된 순). 스파크라인 렌더에 사용. 2개 미만이면 스파크라인 생략. */
  history?: number[];
  className?: string;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trendUp = (values[values.length - 1] ?? 0) >= (values[0] ?? 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="최근 시세 추이"
      data-testid="price-card-sparkline"
    >
      <polyline
        fill="none"
        stroke={trendUp ? colors.up : colors.down}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function PriceCard({ pricePerKg, changeAmount, history = [], className }: PriceCardProps) {
  const isUp = changeAmount > 0;
  const isDown = changeAmount < 0;
  const changeColor = isUp ? colors.up : isDown ? colors.down : colors.status.wait;
  const arrow = isUp ? "▲" : isDown ? "▼" : "-";

  return (
    <div
      className={className}
      data-testid="price-card"
      style={{
        borderRadius: radius.card,
        padding: 20,
        backgroundColor: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>현재 매입가</p>
        <p
          className="oilpick-tabular-nums"
          style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 700, color: colors.primary.DEFAULT }}
        >
          {formatKrw(pricePerKg)}
          <span style={{ fontSize: 16, fontWeight: 500 }}>/kg</span>
        </p>
        <p
          className="oilpick-tabular-nums"
          data-testid="price-card-change"
          style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600, color: changeColor }}
        >
          {arrow} {formatKrw(Math.abs(changeAmount))}
        </p>
      </div>
      <Sparkline values={history} />
    </div>
  );
}

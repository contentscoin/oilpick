import { formatKrw } from "@oilpick/core";
import { colors, elevation, gray, radius, surface } from "../tokens";

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
  const width = 88;
  const height = 44;
  // 위/아래로 선이 잘리지 않도록 상하 여백 확보.
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  // 은은한 면 채움으로 깊이감.
  const area = `${coords[0]!.x},${height} ${line} ${coords[coords.length - 1]!.x},${height}`;
  const trendUp = (values[values.length - 1] ?? 0) >= (values[0] ?? 0);
  const stroke = trendUp ? colors.up : colors.down;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="최근 시세 추이"
      data-testid="price-card-sparkline"
    >
      <polygon points={area} fill={stroke} fillOpacity={0.1} stroke="none" />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line}
      />
      <circle
        cx={coords[coords.length - 1]!.x}
        cy={coords[coords.length - 1]!.y}
        r={2.5}
        fill={stroke}
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
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
        boxShadow: elevation.card,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: colors.status.wait }}>
          오늘 매입가
        </p>
        <p
          className="oilpick-tabular-nums"
          style={{
            margin: "6px 0 0",
            fontSize: 34,
            lineHeight: 1.1,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: colors.primary.DEFAULT,
            // [03 레이아웃 강건성] 금액은 ellipsis 금지 — nowrap을 걷어내고 줄바꿈을 허용한다
            // (글자 확대 시 34px 금액이 카드 폭을 밀어내던 결함).
          }}
        >
          {formatKrw(pricePerKg)}
          <span style={{ fontSize: 16, fontWeight: 500, color: colors.status.wait }}>/kg</span>
        </p>
        {/* 등락 pill(▲ 빨강 / ▼ 파랑 / - 회색) + "전일 대비". 05-design-upgrade.md PriceCard. */}
        <span
          className="oilpick-tabular-nums"
          data-testid="price-card-change"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 10,
            padding: "3px 10px",
            borderRadius: radius.pill,
            fontSize: 13,
            fontWeight: 700,
            color: changeColor,
            backgroundColor: `${changeColor}14`,
          }}
        >
          {arrow} {formatKrw(Math.abs(changeAmount))}
          <span style={{ fontWeight: 500, color: colors.status.wait }}>전일 대비</span>
        </span>
      </div>
      {/* 스파크라인이 있을 때만 컨테이너를 마운트한다. history 개수에 따라 padding/background 값을
          토글하면 React가 shorthand/longhand 스타일 diff 경고를 내므로, 값 토글 대신 조건부 렌더 +
          longhand 속성으로 통일한다. */}
      {history.length >= 2 && (
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            alignSelf: "stretch",
            display: "flex",
            alignItems: "center",
            borderRadius: 12,
            backgroundColor: gray[50],
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 10,
            paddingRight: 10,
          }}
        >
          <Sparkline values={history} />
        </div>
      )}
    </div>
  );
}

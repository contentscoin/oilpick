import { useMemo } from "react";
import { formatKrw } from "@oilpick/core";
import type { PriceChartPoint } from "./PriceChart";
import { colors, gray, numericFontVariant, surfaceDark, typeScale } from "../tokens";

/**
 * 08-payout-pivot.md G4-② — 시세 기간 통계 행(최고/최저/평균/기간 등락률).
 * PriceChart와 같은 일별 리샘플 데이터(resampleDaily 출력)를 받아 4개 스탯을 한 줄로 보여준다.
 * 홈 다크 히어로(onDark)와 /price 상세(라이트) 양쪽에서 재사용.
 * 데이터 2점 미만이면 null(차트와 동일한 빈 상태 규약).
 */
export interface PriceStatsRowProps {
  data: PriceChartPoint[];
  /** 다크 히어로 위 렌더 여부(텍스트 색 전환). */
  onDark?: boolean;
  className?: string;
}

export function PriceStatsRow({ data, onDark = false, className }: PriceStatsRowProps) {
  const stats = useMemo(() => {
    if (data.length < 2) return null;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const first = prices[0]!;
    const last = prices[prices.length - 1]!;
    const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
    return { min, max, avg, changePct };
  }, [data]);

  if (!stats) return null;

  const labelColor = onDark ? surfaceDark.textOnDarkMuted : gray[500];
  const valueColor = onDark ? surfaceDark.textOnDark : gray[900];
  const changeColor =
    stats.changePct === 0 ? labelColor : stats.changePct > 0 ? colors.up : colors.down;
  const changeText = `${stats.changePct > 0 ? "+" : ""}${stats.changePct.toFixed(1)}%`;

  const items = [
    { label: "기간 최고", value: formatKrw(stats.max), color: valueColor },
    { label: "기간 최저", value: formatKrw(stats.min), color: valueColor },
    { label: "평균", value: formatKrw(stats.avg), color: valueColor },
    { label: "기간 등락", value: changeText, color: changeColor },
  ];

  return (
    <div
      data-testid="price-stats-row"
      className={className}
      // [03 레이아웃 강건성] 고정 4열 대신 auto-fit — 글자 확대·좁은 폭에서 2×2로 접힌다.
      // 1x 기준 컨테이너 폭 408px 이상(480px 화면 - 페이지 패딩)이면 그대로 4열 유지.
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: typeScale.caption, color: labelColor, marginBottom: 2 }}>{item.label}</div>
          <div
            style={{
              fontSize: typeScale.label,
              fontWeight: 700,
              color: item.color,
              ...numericFontVariant,
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

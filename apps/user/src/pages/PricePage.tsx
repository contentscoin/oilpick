import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colors, gray, radius, surface } from "@oilpick/ui";
import { formatKrw } from "@oilpick/core";
import { usePriceTicks, type PriceTick } from "../hooks/usePriceTicks";

type RangeTab = "day" | "week" | "month";

const RANGE_LABEL: Record<RangeTab, string> = {
  day: "일",
  week: "주",
  month: "월",
};

/** tick effective_at을 탭 단위로 그룹핑해 각 그룹의 마지막(가장 최근) tick만 남긴다. */
function resample(ticks: PriceTick[], range: RangeTab): PriceTick[] {
  const sorted = [...ticks].sort(
    (a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime(),
  );

  function bucketKey(dateStr: string): string {
    const d = new Date(dateStr);
    if (range === "day") {
      return d.toISOString().slice(0, 10);
    }
    if (range === "week") {
      const dayOfWeek = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
      return monday.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 7);
  }

  const byBucket = new Map<string, PriceTick>();
  for (const tick of sorted) {
    byBucket.set(bucketKey(tick.effectiveAt), tick);
  }
  return Array.from(byBucket.values());
}

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * U4 시세 상세. 03-frontend.md: "recharts + 이력 테이블(최근 30 tick)".
 * 일/주/월 탭은 price_ticks를 클라이언트에서 리샘플링한다(같은 절 "차트" 항목).
 */
export function PricePage() {
  const navigate = useNavigate();
  const { data: ticks, isLoading } = usePriceTicks(30);
  const [range, setRange] = useState<RangeTab>("day");

  const chartData = useMemo(() => {
    const resampled = resample(ticks ?? [], range);
    return resampled.map((t) => ({
      effectiveAt: t.effectiveAt,
      label: formatAxisDate(t.effectiveAt),
      pricePerKg: t.pricePerKg,
    }));
  }, [ticks, range]);

  const historyDesc = useMemo(
    () => [...(ticks ?? [])].sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime()),
    [ticks],
  );

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="price-page-back"
          onClick={() => navigate(-1)}
          aria-label="뒤로가기"
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>시세 상세</h1>
      </div>

      <div data-testid="price-range-tabs" style={{ display: "flex", gap: 8 }}>
        {(Object.keys(RANGE_LABEL) as RangeTab[]).map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`price-range-tab-${r}`}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: radius.button,
              border: `1px solid ${range === r ? colors.primary.DEFAULT : surface.border}`,
              backgroundColor: range === r ? colors.primary.light : "#fff",
              color: range === r ? colors.primary.dark : "#333",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div data-testid="price-chart-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
      ) : (
        <div data-testid="price-chart" style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={surface.border} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                width={56}
                tick={{ fontSize: 12 }}
                domain={["dataMin - 20", "dataMax + 20"]}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip formatter={(value: number) => formatKrw(value)} labelFormatter={(label) => label} />
              <Line type="monotone" dataKey="pricePerKg" stroke={colors.primary.DEFAULT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>최근 이력</h2>
        <div style={{ overflowX: "auto" }}>
          <table data-testid="price-history-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: colors.status.wait, borderBottom: `1px solid ${surface.border}` }}>
                <th style={{ padding: "8px 4px", fontWeight: 500 }}>적용 시각</th>
                <th style={{ padding: "8px 4px", fontWeight: 500 }}>매입가(원/kg)</th>
                <th style={{ padding: "8px 4px", fontWeight: 500 }}>수거비(P)</th>
              </tr>
            </thead>
            <tbody>
              {historyDesc.map((tick) => (
                <tr key={tick.id} style={{ borderBottom: `1px solid ${surface.border}` }}>
                  <td style={{ padding: "8px 4px" }}>{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                  <td className="oilpick-tabular-nums" style={{ padding: "8px 4px" }}>
                    {formatKrw(tick.pricePerKg)}
                  </td>
                  <td className="oilpick-tabular-nums" style={{ padding: "8px 4px" }}>
                    {tick.riderFee.toLocaleString("ko-KR")}P
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

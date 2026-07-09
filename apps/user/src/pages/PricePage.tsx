import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PriceChart,
  SegmentToggle,
  colors,
  elevation,
  gradient,
  radius,
  surface,
  surfaceDark,
  typeScale,
  type PriceChartPoint,
} from "@oilpick/ui";
import { dailyChange, formatKrw, resampleDaily } from "@oilpick/core";
import { usePriceTicksSince, type PriceTicksSinceDays } from "../hooks/usePriceTicks";

/** "YYYY-MM-DD" → "M월 D일". 스크럽 중 현재가 라벨용. */
function koDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * U4 시세 상세 — 07 F7·F8. recharts 폐기 → 홈 히어로와 **동일 체계**(PriceChart + resampleDaily +
 * SegmentToggle). 상단 다크 히어로(현재가 + 일별 차트 + 기간 토글) + 하단 이력 테이블.
 * 내부 private resample()은 삭제(§1-5 resampleDaily가 단일 진실).
 */
export function PricePage() {
  const navigate = useNavigate();
  const [days, setDays] = useState<PriceTicksSinceDays>(30);
  const [scrub, setScrub] = useState<PriceChartPoint | null>(null);

  const { data: ticks, isLoading } = usePriceTicksSince(days);

  const daily = useMemo(() => resampleDaily(ticks ?? [], days), [ticks, days]);
  const hasChart = daily.length >= 2;
  const latestClose = daily.length > 0 ? daily[daily.length - 1]!.price : 0;
  const change = dailyChange(daily);
  const displayPrice = scrub ? scrub.price : latestClose;
  const heroLabel = scrub ? koDate(scrub.date) : "현재 매입가";

  const changeColor = change > 0 ? colors.up : change < 0 ? colors.down : surfaceDark.textOnDarkMuted;
  const changeArrow = change > 0 ? "▲" : change < 0 ? "▼" : "–";

  const historyDesc = useMemo(
    () => [...(ticks ?? [])].sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime()),
    [ticks],
  );

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: 20,
        maxWidth: 560,
        margin: "0 auto",
        backgroundColor: surface.app,
        minHeight: "100vh",
      }}
    >
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
        <h1 style={{ fontSize: typeScale.title, margin: 0 }}>시세 상세</h1>
      </div>

      {/* 다크 히어로 — 홈과 동일 체계 */}
      <section
        data-testid="price-hero"
        style={{
          background: gradient.heroDeep,
          borderRadius: radius.hero,
          boxShadow: elevation.heroDark,
          padding: 20,
          color: surfaceDark.textOnDark,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p
          data-testid="price-hero-label"
          style={{ margin: 0, fontSize: typeScale.label, fontWeight: 500, color: surfaceDark.textOnDarkMuted }}
        >
          {heroLabel}
        </p>

        {isLoading ? (
          <div
            data-testid="price-chart-skeleton"
            style={{ height: 220, borderRadius: radius.card, backgroundColor: surfaceDark.skeleton }}
          />
        ) : latestClose === 0 && daily.length === 0 ? (
          <p data-testid="price-hero-nodata" style={{ margin: "8px 0", fontSize: typeScale.body, color: surfaceDark.textOnDarkMuted }}>
            아직 등록된 시세가 없어요.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <span
                data-testid="hero-price"
                className="oilpick-tabular-nums"
                style={{ fontSize: typeScale.display, fontWeight: 800, lineHeight: 1.05, color: surfaceDark.textOnDark }}
              >
                {displayPrice.toLocaleString("ko-KR")}
              </span>
              <span style={{ fontSize: typeScale.body, fontWeight: 500, color: surfaceDark.textOnDarkMuted, paddingBottom: 4 }}>
                원/kg
              </span>
              {!scrub && (
                <span
                  data-testid="hero-change-pill"
                  className="oilpick-tabular-nums"
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 10px",
                    borderRadius: radius.pill,
                    backgroundColor: surfaceDark.pill,
                    fontSize: typeScale.label,
                    fontWeight: 700,
                    color: changeColor,
                  }}
                >
                  <span aria-hidden>{changeArrow}</span>
                  {Math.abs(change).toLocaleString("ko-KR")}원
                  <span style={{ color: surfaceDark.textOnDarkMuted, fontWeight: 500 }}>· 전일 대비</span>
                </span>
              )}
            </div>

            {hasChart ? (
              <PriceChart
                data={daily}
                stroke={colors.chart.lineOnDark}
                areaColor={colors.chart.areaTop}
                onDark
                onScrub={setScrub}
              />
            ) : (
              <p
                data-testid="price-empty-caption"
                style={{ margin: "16px 0", textAlign: "center", fontSize: typeScale.label, color: surfaceDark.textOnDarkMuted }}
              >
                시세 데이터가 쌓이면 차트가 표시돼요.
              </p>
            )}

            <SegmentToggle
              options={[
                { value: "7", label: "7일" },
                { value: "30", label: "30일" },
                { value: "90", label: "90일" },
              ]}
              value={String(days)}
              onChange={(v) => setDays(Number(v) as PriceTicksSinceDays)}
              ariaLabel="기간 선택"
            />
          </>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: typeScale.body, margin: "0 0 12px" }}>최근 이력</h2>
        {historyDesc.length === 0 ? (
          <p style={{ margin: 0, fontSize: typeScale.label, color: colors.status.wait }}>선택한 기간에 등록된 시세가 없어요.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table data-testid="price-history-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: colors.status.wait, borderBottom: `1px solid ${surface.border}` }}>
                  <th style={{ padding: "8px 4px", fontWeight: 500 }}>적용 시각</th>
                  <th style={{ padding: "8px 4px", fontWeight: 500 }}>매입가(원/kg)</th>
                </tr>
              </thead>
              <tbody>
                {historyDesc.map((tick) => (
                  <tr key={tick.id} style={{ borderBottom: `1px solid ${surface.border}` }}>
                    <td style={{ padding: "8px 4px" }}>{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="oilpick-tabular-nums" style={{ padding: "8px 4px" }}>
                      {formatKrw(tick.pricePerKg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

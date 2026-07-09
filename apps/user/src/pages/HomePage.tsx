import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BigButton,
  PriceChart,
  SegmentToggle,
  StatusBadge,
  colors,
  elevation,
  gradient,
  gray,
  radius,
  surface,
  surfaceDark,
  typeScale,
  usePrefersReducedMotion,
  type PriceChartPoint,
} from "@oilpick/ui";
import { ORDER_STATUS_LABEL, dailyChange, formatKg, formatKrw, resampleDaily } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { usePriceTicksSince, type PriceTicksSinceDays } from "../hooks/usePriceTicks";
import { useActiveOrder } from "../hooks/useActiveOrder";
import { useOrderHistory } from "../hooks/useOrderHistory";
import { useMonthlyCashReceipt } from "../hooks/useCashReceipts";
import { useNotifications } from "../hooks/useNotifications";

/**
 * U3 홈 — 07 F8 전면 리디자인. **일별 시세 히어로가 주인공**.
 * 정보구조(위→아래): 헤더(로고+알림 벨/이력) → 다크 시세 히어로(현재가 40px 순백 + PriceChart 민트 +
 * 기간 토글) → 진행중 주문 카드 → 이번 달 현금 수령 요약 → 최근 수거 이력 2건 → 하단 fixed "수거 요청하기".
 * 구모델의 QtyStepper+예상포인트 섹션은 제거(RequestPage step1로 일원화, 07 F8).
 */

const COUNT_UP_MS = 400;

/** "YYYY-MM-DD" → "M월 D일". 스크럽 중 히어로 라벨용. */
function koDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 목표값까지 rAF 카운트업(easeOutCubic). animate=false거나 duration<=0이면 즉시 반영
 * (prefers-reduced-motion 존중). 최초 로딩(0→현재가)에서 숫자가 굴러오르게 한다.
 */
function useCountUp(target: number, durationMs: number, animate: boolean): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    if (!animate || durationMs <= 0) {
      prevRef.current = target;
      setValue(target);
      return;
    }
    const from = prevRef.current;
    if (from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prevRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, animate]);

  return value;
}

/** 시세 히어로 위 작은 벨 아이콘(currentColor stroke). */
function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.6-.9 2.2L5 15h14l-1.1-1.3a3.2 3.2 0 0 1-.9-2.2V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const reduce = usePrefersReducedMotion();

  const [days, setDays] = useState<PriceTicksSinceDays>(30);
  const [scrub, setScrub] = useState<PriceChartPoint | null>(null);

  const { data: ticks, isLoading: priceLoading } = usePriceTicksSince(days);
  const { data: activeOrder } = useActiveOrder(userId);
  const { data: history } = useOrderHistory(userId, 0);
  const { data: monthly } = useMonthlyCashReceipt(userId);
  const { data: notifications } = useNotifications(userId);

  const daily = resampleDaily(ticks ?? [], days);
  const hasChart = daily.length >= 2;
  const latestClose = daily.length > 0 ? daily[daily.length - 1]!.price : 0;
  const change = dailyChange(daily);

  const animatedPrice = useCountUp(latestClose, COUNT_UP_MS, !reduce);
  const displayPrice = scrub ? scrub.price : animatedPrice;
  const heroLabel = scrub ? koDate(scrub.date) : "오늘 매입가";

  const recentOrders = (history?.items ?? []).slice(0, 2);
  const unread = (notifications ?? []).filter((n) => !n.readAt).length;

  const changeColor = change > 0 ? colors.up : change < 0 ? colors.down : surfaceDark.textOnDarkMuted;
  const changeArrow = change > 0 ? "▲" : change < 0 ? "▼" : "–";

  return (
    <>
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "16px 20px 148px",
          maxWidth: 480,
          margin: "0 auto",
          backgroundColor: surface.app,
          minHeight: "100vh",
        }}
      >
        {/* 헤더: 로고 + 알림 벨/이력 */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <h1 style={{ fontSize: typeScale.title, fontWeight: 800, margin: 0, color: colors.primary.dark }}>OilPick</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              data-testid="notifications-link"
              aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
              onClick={() => navigate("/notifications")}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                border: "none",
                background: "none",
                color: gray[600],
                cursor: "pointer",
                padding: 0,
              }}
            >
              <BellIcon />
              {unread > 0 && (
                <span
                  data-testid="notifications-unread-dot"
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 8,
                    minWidth: 8,
                    height: 8,
                    borderRadius: radius.pill,
                    backgroundColor: colors.up,
                    border: `1.5px solid ${surface.app}`,
                  }}
                />
              )}
            </button>
            <button
              type="button"
              data-testid="orders-history-link"
              onClick={() => navigate("/orders")}
              style={{
                background: "none",
                border: "none",
                color: gray[600],
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "0 4px",
              }}
            >
              이력
            </button>
          </div>
        </header>

        {/* 다크 시세 히어로 — 주인공 */}
        <section
          data-testid="price-hero"
          style={{
            position: "relative",
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p
              data-testid="price-hero-label"
              style={{ margin: 0, fontSize: typeScale.label, fontWeight: 500, color: surfaceDark.textOnDarkMuted }}
            >
              {heroLabel}
            </p>
            <button
              type="button"
              data-testid="price-detail-link"
              onClick={() => navigate("/price")}
              style={{
                background: "none",
                border: "none",
                color: surfaceDark.textOnDarkMuted,
                fontSize: typeScale.label,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              시세 상세 &gt;
            </button>
          </div>

          {priceLoading ? (
            <div
              data-testid="price-hero-skeleton"
              style={{ height: 200, borderRadius: radius.card, backgroundColor: surfaceDark.skeleton }}
            />
          ) : latestClose === 0 && daily.length === 0 ? (
            <p data-testid="price-hero-nodata" style={{ margin: "8px 0 4px", fontSize: typeScale.body, color: surfaceDark.textOnDarkMuted }}>
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
                  style={{
                    margin: "16px 0",
                    textAlign: "center",
                    fontSize: typeScale.label,
                    color: surfaceDark.textOnDarkMuted,
                  }}
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

        {/* 진행중 주문 카드(좌측 그린 바) */}
        {activeOrder && (
          <button
            type="button"
            data-testid="active-order-card"
            onClick={() => navigate(`/orders/${activeOrder.id}`)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: radius.card,
              padding: 16,
              backgroundColor: surface.card,
              border: `1px solid ${surface.border}`,
              borderLeft: `4px solid ${colors.primary.DEFAULT}`,
              boxShadow: elevation.card,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: typeScale.label, color: colors.status.wait }}>진행중인 수거 요청</p>
              <p style={{ margin: "4px 0 0", fontSize: typeScale.body, fontWeight: 700 }}>
                {ORDER_STATUS_LABEL[activeOrder.status]}
              </p>
            </div>
            <StatusBadge status={activeOrder.status} />
          </button>
        )}

        {/* 이번 달 현금 수령 요약 1줄 카드 → 수령 이력 */}
        <button
          type="button"
          data-testid="cash-receipt-summary"
          onClick={() => navigate("/wallet")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: radius.card,
            padding: "16px 18px",
            backgroundColor: surface.card,
            border: `1px solid ${surface.border}`,
            boxShadow: elevation.card,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: typeScale.body, fontWeight: 600, color: colors.status.wait }}>이번 달 수령</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              className="oilpick-tabular-nums"
              style={{ fontSize: typeScale.title, fontWeight: 800, color: colors.status.done }}
            >
              {formatKrw(monthly?.cash ?? 0)}
            </span>
            <span aria-hidden style={{ color: gray[400], fontSize: typeScale.body }}>&gt;</span>
          </span>
        </button>

        {/* 최근 수거 이력 2건 */}
        <section data-testid="recent-orders" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: typeScale.body, margin: 0 }}>최근 수거 이력</h2>
            <button
              type="button"
              data-testid="recent-orders-more"
              onClick={() => navigate("/orders")}
              style={{ background: "none", border: "none", color: colors.primary.DEFAULT, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              전체 보기
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <p style={{ margin: 0, fontSize: typeScale.label, color: colors.status.wait }}>아직 수거 이력이 없어요.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    data-testid="recent-order-item"
                    onClick={() => navigate(`/orders/${order.id}`)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      textAlign: "left",
                      border: `1px solid ${surface.border}`,
                      borderRadius: radius.card,
                      padding: "12px 16px",
                      backgroundColor: surface.card,
                      boxShadow: elevation.card,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, color: colors.status.wait }}>
                        {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                      <span style={{ fontSize: 14 }}>{formatKg(order.finalKg ?? order.requestedKg)}</span>
                    </div>
                    <StatusBadge status={order.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* 하단 fixed CTA — 탭바 위, safe-area */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px", pointerEvents: "auto" }}>
          <BigButton data-testid="request-pickup-button" onClick={() => navigate("/request")}>
            수거 요청하기
          </BigButton>
        </div>
      </div>
    </>
  );
}

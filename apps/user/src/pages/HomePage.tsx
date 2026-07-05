import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, PriceCard, QtyStepper, StatusBadge, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import { estimateKg, estimatePoint, formatPoint, ORDER_STATUS_LABEL } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useLatestPriceTick, usePriceTicks } from "../hooks/usePriceTicks";
import { useActiveOrder } from "../hooks/useActiveOrder";

/**
 * U3 홈. 03-frontend.md:
 * "PriceCard(최신 tick, Realtime 구독) + QtyStepper→estimatePoint 실시간 표시 +
 * BigButton '수거 요청하기'. 진행중 주문 있으면 상단에 진행 카드 고정".
 *
 * "수거 요청하기" 버튼은 /request로 이동만 한다 — 실제 요청 폼(U5)은 T8 범위(작업 지시 명시).
 */
export function HomePage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: latestTick, isLoading: priceLoading } = useLatestPriceTick();
  const { data: history } = usePriceTicks(10);
  const { data: activeOrder } = useActiveOrder(userId);

  const [cans, setCans] = useState(1);
  const estimatedKg = estimateKg(cans);
  const estimatedPoint = latestTick ? estimatePoint(estimatedKg, latestTick.pricePerKg) : 0;

  const priceHistoryValues = (history ?? []).map((t) => t.pricePerKg).reverse();
  const previousPrice = priceHistoryValues.length >= 2 ? priceHistoryValues[priceHistoryValues.length - 2] : undefined;
  const changeAmount = latestTick && previousPrice !== undefined ? latestTick.pricePerKg - previousPrice : 0;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, margin: "8px 0 0" }}>OilPick</h1>
        <button
          type="button"
          data-testid="orders-history-link"
          onClick={() => navigate("/orders")}
          style={{
            background: "none",
            border: "none",
            color: colors.status.wait,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          이력 보기
        </button>
      </div>

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
            // 좌측 얇은 green 액센트 바로 "진행중"임을 강조. shadow-card로 배경 위에 띄운다.
            borderLeft: `4px solid ${colors.primary.DEFAULT}`,
            boxShadow: elevation.card,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>진행중인 수거 요청</p>
            <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>
              {ORDER_STATUS_LABEL[activeOrder.status]}
            </p>
          </div>
          <StatusBadge status={activeOrder.status} />
        </button>
      )}

      {priceLoading ? (
        <div
          data-testid="price-card-skeleton"
          style={{ borderRadius: radius.card, height: 96, backgroundColor: gray[100] }}
        />
      ) : (
        latestTick && (
          <PriceCard
            pricePerKg={latestTick.pricePerKg}
            changeAmount={changeAmount}
            history={priceHistoryValues}
          />
        )
      )}

      <button
        type="button"
        data-testid="price-detail-link"
        onClick={() => navigate("/price")}
        style={{
          alignSelf: "flex-end",
          background: "none",
          border: "none",
          color: colors.primary.DEFAULT,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
        }}
      >
        시세 상세 보기 &gt;
      </button>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>수거 요청 수량</h2>
        <QtyStepper value={cans} onChange={setCans} />
        <div
          data-testid="estimated-point"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 20px",
            borderRadius: radius.card,
            backgroundColor: colors.accent.light,
            border: `1px solid ${surface.border}`,
            boxShadow: elevation.card,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.status.wait }}>예상 지급 포인트</span>
          <span
            className="oilpick-tabular-nums"
            style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.DEFAULT }}
          >
            {formatPoint(estimatedPoint)}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
          실제 지급 포인트는 현장 계량 기준으로 확정됩니다.
        </p>
      </section>

      <BigButton data-testid="request-pickup-button" onClick={() => navigate("/request")}>
        수거 요청하기
      </BigButton>
    </main>
  );
}

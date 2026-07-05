import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BigButton, DriverCard, InfoStatCard, MapView, OrderTimeline, StatusHeadline, colors, elevation, gray, radius, surface, touchTarget } from "@oilpick/ui";
import { formatKg, formatKrw, formatPoint, formatTimeOfDay, type OrderStatus } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useOrder } from "../hooks/useOrder";
import { useAssignedRiderCard } from "../hooks/useAssignedRiderCard";

/**
 * U6~U9 "/orders/:id" 상태별 단일 화면. 03-frontend.md 63행:
 * "status로 분기 렌더. REQUESTED: 반경 애니메이션+취소. ACCEPTED~: MapView(라이더 위치 Realtime
 * broadcast 구독)+OrderTimeline+라이더 카드(이름/차량/인증배지/전화 tel:). ARRIVED+measured_kg
 * 있음: 계량 확인 UI(사진 뷰어+확정 kg+포인트 미리보기+[확인][이의신청]). COMPLETED: 지급 포인트
 * 대형 표시".
 *
 * 라이더 위치 Realtime broadcast(`order:{orderId}:location`, 02-api.md rider-location)는
 * rider-location 함수가 아직 실제 호출되지 않을 수 있으므로(04-tasks.md 태스크 지시) 좌표가
 * 없으면 MapView가 자체적으로 placeholder를 그린다(packages/ui MapView 이미 이 폴백 내장).
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading } = useOrder(id);
  const { data: rider } = useAssignedRiderCard(order?.riderId);

  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <div data-testid="order-detail-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
      </main>
    );
  }

  if (!order || !id) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <p>주문을 찾을 수 없어요.</p>
      </main>
    );
  }

  async function handleCancel() {
    if (!id) return;
    setActionError(null);
    setCancelling(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "CANCEL",
      payload: { reason: "사용자 취소" },
    });
    setCancelling(false);
    if (!result.ok) setActionError(result.message);
  }

  async function handleConfirmMeasure() {
    if (!id) return;
    setActionError(null);
    setConfirming(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "CONFIRM_MEASURE",
      payload: {},
    });
    setConfirming(false);
    if (!result.ok) setActionError(result.message);
  }

  async function handleDispute() {
    if (!id || !disputeReason.trim()) return;
    setActionError(null);
    setDisputing(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "DISPUTE",
      payload: { reason: disputeReason.trim() },
    });
    setDisputing(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setShowDisputeForm(false);
  }

  const showMeasureConfirmUi = order.status === "ARRIVED" && order.measuredKg != null;
  const showRiderCard = order.status !== "REQUESTED" && order.status !== "CANCELLED";
  const showMapAndTimeline = order.status !== "REQUESTED" && order.status !== "CANCELLED";

  // 확정 전(계량 전) 상태에서만 예상 스탯 카드 노출. COMPLETED는 지급포인트 패널을 대신 쓴다.
  const showInfoStatCard =
    order.status === "ACCEPTED" || order.status === "ARRIVED" || order.status === "PICKED_UP";
  const estimatedPoint = Math.round(order.requestedKg * order.snapshotPricePerKg);

  // U7 목업: 라이더 배정 이후 보조문구에 라이더명 포함. 배정 전/취소는 status 기본값 사용.
  const headlineSubtitle =
    rider && (order.status === "ACCEPTED" || order.status === "ARRIVED")
      ? `${rider.displayName} 라이더가 매장으로 이동 중이에요`
      : undefined;

  // 타임라인 각 스텝의 실제 시각. 스키마에 arrived_at/completed_at 컬럼이 없어(01-db-schema.sql)
  // ARRIVED/COMPLETED 노드는 값이 없으면 OrderTimeline이 "-"로 렌더한다(데이터 조작 금지).
  const timelineTimestamps: Partial<Record<OrderStatus, string>> = {};
  if (order.createdAt) timelineTimestamps.REQUESTED = formatTimeOfDay(order.createdAt);
  if (order.acceptedAt) timelineTimestamps.ACCEPTED = formatTimeOfDay(order.acceptedAt);
  if (order.pickedUpAt) timelineTimestamps.PICKED_UP = formatTimeOfDay(order.pickedUpAt);
  if (order.deliveredAt) timelineTimestamps.COMPLETED = formatTimeOfDay(order.deliveredAt);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      {/* U7 목업 헤더: 뒤로(<) + "수거 상세"(중앙) + 우측 알림 벨. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="order-detail-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0, color: gray[900], lineHeight: 1 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 16, margin: 0, flex: 1, fontWeight: 700, textAlign: "center", color: gray[900] }}>
          수거 상세
        </h1>
        <Link
          to="/notifications"
          data-testid="order-detail-notifications"
          aria-label="알림"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            color: gray[900],
            textDecoration: "none",
          }}
        >
          <BellIcon />
        </Link>
      </div>

      {/* 05-design-upgrade.md "## U7 주문상세 — 목업 확정": 상태 헤드라인(near-black 제목 + 우측 pill
          + 라이더명 보조문구). */}
      <StatusHeadline status={order.status} subtitle={headlineSubtitle} />

      {actionError && (
        <p role="alert" data-testid="order-action-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {actionError}
        </p>
      )}

      {order.status === "REQUESTED" && (
        <section data-testid="order-requested-panel" style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
          <RadiusPulse />
          <p style={{ margin: 0, fontSize: 15, color: colors.status.wait, textAlign: "center" }}>
            주변 라이더에게 요청을 전달하고 있어요.
            <br />곧 배정 소식을 알려드릴게요.
          </p>
          <BigButton
            variant="secondary"
            data-testid="order-cancel-button"
            loading={cancelling}
            onClick={handleCancel}
          >
            요청 취소
          </BigButton>
        </section>
      )}

      {order.status === "CANCELLED" && (
        <section data-testid="order-cancelled-panel">
          <p style={{ margin: 0, fontSize: 15 }}>
            {order.cancelReason === "NO_RIDER" ? "수락한 라이더가 없어 자동 취소되었어요." : "요청이 취소되었어요."}
          </p>
        </section>
      )}

      {/* 목업 요소 순서: 지도 → 라이더 카드 → 정보 스탯 카드 → 타임라인.
          카카오키가 있으면 실지도가 뜨고 아래 etaLabel은 무시된다. 키가 없을 때만 목업의 지도
          영역을 재현하는 "지도 미리보기"(장식)가 렌더되며, 이때 ETA는 데모 표기다. 실제 rider-location
          기반 ETA 계산은 후속 작업 — 그때 이 데모 문자열을 실ETA로 교체한다. */}
      {showMapAndTimeline && (
        <MapView
          apiKey={KAKAO_KEY}
          center={{ lat: 37.5509, lng: 126.8225 }}
          pickupLabel={order.pickupAddress}
          etaLabel="12분 후 도착"
          style={{ minHeight: 220 }}
        />
      )}

      {/* 05-design-upgrade.md "라이더/기사 카드": 아바타 이니셜+이름+인증 pill+차량번호+전화 버튼. */}
      {showRiderCard && rider && (
        <DriverCard
          name={rider.displayName}
          vehicleNo={rider.vehicleNumber}
          phone={rider.phone}
          verified={rider.verifyStatus === "APPROVED"}
        />
      )}

      {/* 05-design-upgrade.md "## U7 주문상세 — 목업 확정" 5번: 3열 정보 스탯 카드(확정 전). */}
      {showInfoStatCard && (
        <InfoStatCard
          stats={[
            { label: "예상 수량", value: formatKg(order.requestedKg) },
            { label: "오늘 매입가", value: `${formatKrw(order.snapshotPricePerKg)}/kg` },
            { label: "예상 포인트", value: formatPoint(estimatedPoint), accent: true },
          ]}
          footnote="현장 계량 기준으로 확정됩니다"
        />
      )}

      {showMapAndTimeline && (
        <OrderTimeline currentStatus={order.status} timestamps={timelineTimestamps} />
      )}

      {showMeasureConfirmUi && !showDisputeForm && (
        <section data-testid="measure-confirm-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>계량 결과를 확인해주세요</h2>
          {order.photoUrls.length > 0 && (
            <div data-testid="measure-photo-viewer" style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {order.photoUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="현장 계량 사진"
                  style={{ width: 120, height: 120, objectFit: "cover", borderRadius: radius.button, flexShrink: 0 }}
                />
              ))}
            </div>
          )}
          <div style={{ borderRadius: radius.card, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, color: colors.status.wait }}>확정 계량</span>
              <span data-testid="measured-kg-value" style={{ fontSize: 14, fontWeight: 600 }}>
                {formatKg(order.measuredKg ?? 0)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, color: colors.status.wait }}>예상 지급 포인트</span>
              <span
                data-testid="measure-estimated-point"
                className="oilpick-tabular-nums"
                style={{ fontSize: 18, fontWeight: 700, color: colors.accent.DEFAULT }}
              >
                {formatPoint(Math.round((order.measuredKg ?? 0) * order.snapshotPricePerKg))}
              </span>
            </div>
          </div>
          <BigButton data-testid="confirm-measure-button" loading={confirming} onClick={handleConfirmMeasure}>
            확인
          </BigButton>
          <button
            type="button"
            data-testid="open-dispute-form"
            onClick={() => setShowDisputeForm(true)}
            style={{ background: "none", border: "none", color: colors.status.danger, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            이의신청
          </button>
        </section>
      )}

      {showMeasureConfirmUi && showDisputeForm && (
        <section data-testid="dispute-form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>이의신청 사유</h2>
          <textarea
            data-testid="dispute-reason-input"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="계량 결과가 다른 이유를 알려주세요."
            rows={4}
            style={{ borderRadius: radius.button, border: `1px solid ${surface.border}`, padding: 12, fontSize: 15, resize: "vertical" }}
          />
          <BigButton
            variant="danger"
            data-testid="submit-dispute-button"
            loading={disputing}
            disabled={!disputeReason.trim()}
            onClick={handleDispute}
          >
            이의신청 제출
          </BigButton>
          <button
            type="button"
            data-testid="cancel-dispute-form"
            onClick={() => setShowDisputeForm(false)}
            style={{ background: "none", border: "none", color: colors.status.wait, fontSize: 14, cursor: "pointer", padding: 0 }}
          >
            취소
          </button>
        </section>
      )}

      {order.status === "DISPUTED" && (
        <section data-testid="disputed-panel" style={{ borderRadius: radius.card, backgroundColor: colors.primary.light, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>이의신청이 접수되어 관리자가 확인 중이에요.</p>
        </section>
      )}

      {order.status === "COMPLETED" && (
        <section
          data-testid="completed-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "28px 20px",
            borderRadius: radius.hero,
            backgroundColor: colors.accent.light,
            border: `1px solid ${surface.border}`,
            boxShadow: elevation.card,
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: colors.status.wait }}>지급된 포인트</p>
          <p
            data-testid="completed-supplier-point"
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: colors.accent.DEFAULT }}
          >
            {formatPoint(order.supplierPoint ?? 0)}
          </p>
        </section>
      )}

      {/* U7 목업 하단 CTA: ACCEPTED/ARRIVED(계량 확인 UI 전)에서는 단일 "라이더에게 전화"만.
          00-domain.md — 수락 후 공급자 취소 불가이므로 "요청 취소"는 넣지 않는다. */}
      {(order.status === "ACCEPTED" || (order.status === "ARRIVED" && !showMeasureConfirmUi)) && rider?.phone && (
        <a
          href={`tel:${rider.phone}`}
          data-testid="order-call-rider"
          aria-label={`${rider.displayName} 라이더에게 전화`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            minHeight: touchTarget,
            padding: "14px 20px",
            borderRadius: radius.button,
            backgroundColor: colors.primary.DEFAULT,
            color: "#fff",
            fontSize: 17,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <PhoneCtaIcon />
          라이더에게 전화
        </a>
      )}
    </main>
  );
}

/** U7 헤더 우측 알림 벨 아이콘. */
function BellIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.4 2 6.2.5.5.1 1.3-.6 1.3H4.6c-.7 0-1.1-.8-.6-1.3.8-.8 2-2.2 2-6.2Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}

/** 하단 CTA용 전화 아이콘(흰색). */
function PhoneCtaIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 4h3l1.2 3.2-1.8 1.4a11 11 0 0 0 4.5 4.5l1.4-1.8L18.5 12.5V15.5c0 1-.8 1.8-1.8 1.7A13.5 13.5 0 0 1 4.8 5.8C4.7 4.8 5.5 4 6.5 4Z"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** REQUESTED 상태의 "매칭 중" 반경 애니메이션. 00-domain.md 매칭 규칙 3km→7km→15km 브로드캐스트를
 * 시각적으로 은유하는 확장 링 애니메이션(순수 CSS). */
function RadiusPulse() {
  return (
    <div
      data-testid="radius-pulse"
      style={{
        position: "relative",
        width: 120,
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>
        {`@keyframes oilpick-radius-pulse {
          0% { transform: scale(0.4); opacity: 0.8; }
          100% { transform: scale(1); opacity: 0; }
        }`}
      </style>
      {[0, 0.6, 1.2].map((delay) => (
        <span
          key={delay}
          aria-hidden
          style={{
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: `2px solid ${colors.primary.DEFAULT}`,
            animation: `oilpick-radius-pulse 1.8s ease-out ${delay}s infinite`,
          }}
        />
      ))}
      <span
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundColor: colors.primary.DEFAULT,
        }}
      />
    </div>
  );
}

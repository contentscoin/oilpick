import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigButton, DriverCard, MapView, OrderTimeline, StatusHeadline, colors, elevation, radius, surface } from "@oilpick/ui";
import { formatKg, formatPoint } from "@oilpick/core";
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
        <div data-testid="order-detail-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: "#f4f4f5" }} />
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

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="order-detail-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 15, margin: 0, flex: 1, fontWeight: 600, color: colors.status.wait }}>
          수거 요청 상세
        </h1>
      </div>

      {/* 05-design-upgrade.md "주문 상세 상태 헤드라인": 배지 대신 큰 상태 문장 + 보조설명. */}
      <StatusHeadline status={order.status} />

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

      {order.status !== "REQUESTED" && order.status !== "CANCELLED" && (
        <OrderTimeline currentStatus={order.status} />
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

      {order.status !== "REQUESTED" && order.status !== "CANCELLED" && (
        <MapView apiKey={KAKAO_KEY} center={{ lat: 37.5509, lng: 126.8225 }} />
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
            style={{ borderRadius: radius.button, border: "1px solid #e4e4e7", padding: 12, fontSize: 15, resize: "vertical" }}
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
    </main>
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

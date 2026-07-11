import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BigButton, ConfirmSheet, DriverCard, ErrorScreen, InfoStatCard, MapView, OrderTimeline, PageHeader, StatusHeadline, colors, elevation, gradient, gray, radius, surface, touchTarget, useToast } from "@oilpick/ui";
import { estimateCash, formatKg, formatKrw, formatPoint, formatTimeOfDay, type OrderStatus } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useOrder } from "../hooks/useOrder";
import { useAssignedRiderCard } from "../hooks/useAssignedRiderCard";
import { useSession } from "../hooks/useSession";
import { useUnreadCount } from "../hooks/useUnreadCount";

/**
 * U6~U9 "/orders/:id" 상태별 단일 화면. 03-frontend.md(07 F9 개정):
 * "status로 분기 렌더. REQUESTED: 반경 애니메이션+취소. ACCEPTED~: MapView(라이더 위치 Realtime
 * broadcast 구독)+OrderTimeline+라이더 카드. ARRIVED+measured_kg(또는 중재 final_kg): 계량 확인 UI
 * (사진 뷰어+확정 kg+받을 현금+[무게·현금 수령 확인][이의신청]). COMPLETED: 받은 현금(cash_paid_amount)
 * 대형 표시". 신모델(07 D1): 포인트 표기 폐기 → 현장 현금 수령. CONFIRM_MEASURE = 무게+현금 2자 확인.
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
  const { session } = useSession();
  // 06 E7: 헤더 벨 미읽음 배지 — 홈과 동일한 useUnreadCount로 공통화.
  const unread = useUnreadCount(session?.user.id);
  // 06 E6: mutation 성공/실패 피드백은 전역 토스트로 통일(인라인 에러 텍스트 대체).
  const { showToast } = useToast();

  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  if (isLoading) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <div data-testid="order-detail-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
      </main>
    );
  }

  if (!order || !id) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto", minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ErrorScreen
          title="주문을 찾을 수 없어요."
          description="이미 삭제되었거나 잘못된 주소일 수 있어요."
          action={
            <>
              <BigButton data-testid="order-notfound-home" onClick={() => navigate("/", { replace: true })}>
                홈으로
              </BigButton>
              <BigButton variant="secondary" data-testid="order-notfound-history" onClick={() => navigate("/orders", { replace: true })}>
                수거 이력 보기
              </BigButton>
            </>
          }
        />
      </main>
    );
  }

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "CANCEL",
      payload: { reason: "사용자 취소" },
    });
    setCancelling(false);
    setShowCancelConfirm(false);
    if (result.ok) {
      showToast("요청을 취소했어요", { variant: "success" });
    } else {
      showToast(result.message, { variant: "error" });
    }
  }

  async function handleConfirmMeasure() {
    if (!id) return;
    setConfirming(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "CONFIRM_MEASURE",
      payload: {},
    });
    setConfirming(false);
    if (result.ok) {
      showToast("무게를 확인했어요 — 현금 수령 확인 완료", { variant: "success" });
    } else {
      showToast(result.message, { variant: "error" });
    }
  }

  async function handleDispute() {
    if (!id || !disputeReason.trim()) return;
    setDisputing(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: id,
      action: "DISPUTE",
      payload: { reason: disputeReason.trim() },
    });
    setDisputing(false);
    if (!result.ok) {
      // 실패 시 폼을 닫지 않는다 — 입력한 사유를 유지한 채 재시도할 수 있어야 한다.
      showToast(result.message, { variant: "error" });
      return;
    }
    setShowDisputeForm(false);
    showToast("이의신청을 접수했어요", { variant: "success" });
  }

  // 07 F9: 계량 제출(measuredKg) 또는 중재 확정(finalKg)이 있으면 확인 패널을 노출한다.
  // 중재(RESOLVE_DISPUTE) 후에는 DISPUTED→ARRIVED로 복귀하고 final_kg가 고정된다(재제출 불가) —
  // 이때 현금 지급·수령 확인(CONFIRM_MEASURE)만 남는다(00-domain.md 신 상태머신).
  const isArbitrated = order.status === "ARRIVED" && order.finalKg != null;
  const showMeasureConfirmUi =
    order.status === "ARRIVED" && (order.measuredKg != null || order.finalKg != null);
  // 확인·완료 계산 기준 kg = 중재 확정(finalKg) 우선, 없으면 계량 제출(measuredKg).
  const confirmKg = order.finalKg ?? order.measuredKg ?? 0;
  const confirmCash = Math.round(confirmKg * order.snapshotPricePerKg);

  const showRiderCard = order.status !== "REQUESTED" && order.status !== "CANCELLED";
  const showMapAndTimeline = order.status !== "REQUESTED" && order.status !== "CANCELLED";

  // "예상" 스탯 카드는 계량 확정 전(ACCEPTED, 또는 계량/중재 전 ARRIVED)에만 노출한다.
  const showInfoStatCard =
    order.status === "ACCEPTED" ||
    (order.status === "ARRIVED" && order.measuredKg == null && order.finalKg == null);
  const estimatedCash = estimateCash(order.requestedKg, order.snapshotPricePerKg);

  // 신모델 완료 히어로: 현장 수령 현금(cash_paid_amount). 07 §1-3, D1.
  const showCashHero = order.status === "COMPLETED" && order.cashPaidAmount != null;
  // 레거시(구모델 EARN 포인트) 완료 패널 — 신규 주문은 도달 불가(cash 없이 supplier_point 존재).
  // 레거시 렌더 분기(프로덕션 잔존 주문 완결 표시용).
  const showLegacyPointPanel =
    (order.status === "PICKED_UP" || order.status === "COMPLETED") &&
    order.cashPaidAmount == null &&
    order.supplierPoint != null;
  // 07 F9-⑦: 레거시 주문(picked_up_at/delivered_at 존재)은 OrderTimeline 구경로로 렌더한다.
  const isLegacyOrder = order.pickedUpAt != null || order.deliveredAt != null;

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
      {/* U7 목업 헤더: 뒤로(<) + "수거 상세"(중앙) + 우측 알림 벨 — 공용 PageHeader 관용구. */}
      <PageHeader
        title="수거 상세"
        onBack={() => navigate("/")}
        backTestId="order-detail-back"
        right={
          <Link
            to="/notifications"
            data-testid="order-detail-notifications"
            aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              color: gray[900],
              textDecoration: "none",
            }}
          >
            <BellIcon />
            {/* 06 E7: 미읽음 도트 — 홈 헤더(notifications-unread-dot)와 동일 스타일. */}
            {unread > 0 && (
              <span
                data-testid="order-detail-unread-dot"
                style={{
                  position: "absolute",
                  top: 9,
                  right: 10,
                  minWidth: 8,
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: colors.up,
                  border: `1.5px solid ${surface.app}`,
                }}
              />
            )}
          </Link>
        }
      />

      {/* 05-design-upgrade.md "## U7 주문상세 — 목업 확정": 상태 헤드라인(near-black 제목 + 우측 pill
          + 라이더명 보조문구). */}
      <StatusHeadline status={order.status} subtitle={headlineSubtitle} />

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
            onClick={() => setShowCancelConfirm(true)}
          >
            요청 취소
          </BigButton>
        </section>
      )}

      {order.status === "CANCELLED" && (
        <section data-testid="order-cancelled-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 15 }}>
            {order.cancelReason === "NO_RIDER" ? "수락한 라이더가 없어 자동 취소되었어요." : "요청이 취소되었어요."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BigButton data-testid="order-rerequest-button" onClick={() => navigate("/request")}>
              다시 요청하기
            </BigButton>
            <BigButton variant="secondary" data-testid="order-cancelled-home" onClick={() => navigate("/")}>
              홈으로
            </BigButton>
          </div>
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
            { label: "예상 수령액", value: formatKrw(estimatedCash), accent: true },
          ]}
          footnote="현장 계량 기준으로 확정됩니다"
        />
      )}

      {showMapAndTimeline && (
        <OrderTimeline currentStatus={order.status} timestamps={timelineTimestamps} legacy={isLegacyOrder} />
      )}

      {showMeasureConfirmUi && !showDisputeForm && (
        <section data-testid="measure-confirm-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            {isArbitrated ? "중재 결과를 확인해주세요" : "계량 결과를 확인해주세요"}
          </h2>
          {isArbitrated && (
            <p data-testid="arbitration-notice" style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
              중재 확정 무게 {formatKg(confirmKg)} — 라이더에게 현금 {formatKrw(confirmCash)}을 받고 확인해 주세요.
            </p>
          )}
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
              <span style={{ fontSize: 14, color: colors.status.wait }}>{isArbitrated ? "중재 확정 무게" : "확정 계량"}</span>
              <span data-testid="measured-kg-value" style={{ fontSize: 14, fontWeight: 600 }}>
                {formatKg(confirmKg)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, color: colors.status.wait }}>받을 현금</span>
              <span
                data-testid="measure-cash-amount"
                className="oilpick-tabular-nums"
                style={{ fontSize: 18, fontWeight: 700, color: colors.primary.dark }}
              >
                {formatKrw(confirmCash)}
              </span>
            </div>
          </div>
          {/* 07 F9-⑥: CONFIRM = "무게 확인 + 현금 수령 확인" 2자 확인(현금 수령 증빙). */}
          <BigButton data-testid="confirm-measure-button" loading={confirming} onClick={handleConfirmMeasure}>
            무게 {formatKg(confirmKg)} 확인 · 현금 {formatKrw(confirmCash)} 받았어요
          </BigButton>
          {!isArbitrated && (
            <button
              type="button"
              data-testid="open-dispute-form"
              onClick={() => setShowDisputeForm(true)}
              style={{ background: "none", border: "none", color: colors.status.danger, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              이의신청
            </button>
          )}
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

      {/* 07 F9-⑥: COMPLETED 히어로 — 현장에서 받은 현금(cash_paid_amount). */}
      {showCashHero && (
        <section
          data-testid="completed-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "28px 20px",
            borderRadius: radius.hero,
            background: gradient.brand,
            boxShadow: elevation.raised,
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>받은 현금</p>
          <p
            data-testid="completed-cash-amount"
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
          >
            {formatKrw(order.cashPaidAmount ?? 0)}
          </p>
        </section>
      )}

      {/* 레거시 렌더 분기(구모델 EARN 포인트) — 프로덕션 잔존 주문 완결 표시용. 신규 주문 미도달. */}
      {showLegacyPointPanel && (
        <section
          data-testid="completed-legacy-panel"
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
            style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: colors.accent.deep }}
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

      {/* E5: 요청 취소는 되돌릴 수 없으므로 확인 다이얼로그를 거친다. */}
      <ConfirmSheet
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="요청을 취소할까요?"
        description="취소하면 배정 대기 중인 요청이 사라져요. 필요하면 다시 요청할 수 있어요."
        confirmLabel="요청 취소"
        cancelLabel="닫기"
        danger
        loading={cancelling}
        onConfirm={handleCancel}
      />
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

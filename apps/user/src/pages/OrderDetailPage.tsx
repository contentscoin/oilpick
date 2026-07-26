import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BigButton, ConfirmSheet, DriverCard, ErrorScreen, InfoStatCard, MapView, OrderTimeline, PageHeader, PayoutMethodChip, StatusHeadline, colors, elevation, gradient, gray, radius, surface, touchTarget, useToast } from "@oilpick/ui";
import { estimateCash, formatEta, formatKg, formatKrw, formatPoint, formatTimeOfDay, type OrderStatus } from "@oilpick/core";
import { MAP_STYLE_URL } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useOrder } from "../hooks/useOrder";
import { useAssignedRiderCard } from "../hooks/useAssignedRiderCard";
import { useRiderLocation } from "../hooks/useRiderLocation";
import { useDirections } from "../hooks/useDirections";
import { useSession } from "../hooks/useSession";

/**
 * [14 J4] 상계 결제 실패(CONFIRM_MEASURE)의 맥락 카피. 공용 ERROR_MESSAGE_KO는
 * INSUFFICIENT_BALANCE를 출금 맥락("출금 가능 잔액이 부족해요")으로 정의하고 있어 이 화면에선
 * 원인도 다음 행동도 알 수 없다. 두 실패 모두 복구 경로는 "라이더가 현금 지급으로 재제출"이다(14 §3).
 */
function settlementFailureMessage(code: string | undefined): string | null {
  if (code === "INSUFFICIENT_BALANCE") {
    return "포인트 잔액이 부족해요 — 라이더에게 현금 지급으로 다시 제출해 달라고 요청해 주세요.";
  }
  if (code === "DEALER_LIMIT_EXCEEDED") {
    return "지금은 포인트로 지급할 수 없어요 — 라이더에게 현금 지급으로 다시 제출해 달라고 요청해 주세요.";
  }
  return null;
}
import { useUnreadCount } from "../hooks/useUnreadCount";

/**
 * U6~U9 "/orders/:id" 상태별 단일 화면. 03-frontend.md(08 G5-③ 개정):
 * "status로 분기 렌더. REQUESTED: 반경 애니메이션+취소. ACCEPTED~: MapView(라이더 위치 Realtime
 * broadcast 구독)+OrderTimeline+라이더 카드. ARRIVED+measured_kg(또는 중재 final_kg): 계량 확인 UI
 * (사진 뷰어+확정 kg+지급수단 칩+수단별 확인 CTA+[이의신청]). COMPLETED: 확정 지급액 히어로 수단별".
 * 08 P2/P3: 지급수단은 라이더가 SUBMIT_MEASURE에서 선택(payout_method) — CASH는 07과 동일한
 * 현금 2자 확인, POINT는 CONFIRM과 원자적으로 point_ledger EARN이 발행된다(서버).
 * payout_method null은 레거시 주문 → CASH 간주(coalesce, 08 P3).
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
  // [14 J1] 라이더가 이동 중(ACCEPTED/ARRIVED)일 때만 실시간 위치를 구독한다(그 외엔 null).
  const riderLoc = useRiderLocation(id, order?.status === "ACCEPTED" || order?.status === "ARRIVED");
  // [11 M9-b] 라이더 실좌표가 잡히고 수거지 좌표가 있을 때만 도로 경로·ETA를 조회한다.
  // 라이더가 이미 도착(ARRIVED)했으면 경로 안내는 의미가 없어 ACCEPTED에서만 활성.
  const pickupPoint =
    order?.pickupLat != null && order?.pickupLng != null
      ? { lat: order.pickupLat, lng: order.pickupLng }
      : null;
  const { data: directions } = useDirections(
    riderLoc ? { lat: riderLoc.lat, lng: riderLoc.lng } : null,
    pickupPoint,
    order?.status === "ACCEPTED" && !riderLoc?.stale,
  );
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
      // 08 G5-③: 수단별 확인 카피 — POINT는 CONFIRM과 원자적으로 EARN이 적립된다(서버).
      showToast(
        order?.payoutMethod === "POINT"
          ? "무게를 확인했어요 — 포인트가 적립됐어요"
          : "무게를 확인했어요 — 현금 수령 확인 완료",
        { variant: "success" },
      );
    } else {
      // [14 J4] 상계 결제 실패 2종은 "현금으로 재제출"이 복구 경로다. 공용 코드 메시지는
      // 출금 맥락 문구라 여기서 맥락 카피로 덮어쓴다(그대로 두면 원인도 다음 행동도 알 수 없다).
      showToast(settlementFailureMessage(result.code) ?? result.message, { variant: "error" });
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
  // 이때 지급·수령 확인(CONFIRM_MEASURE)만 남는다(00-domain.md 신 상태머신).
  const isArbitrated = order.status === "ARRIVED" && order.finalKg != null;
  const showMeasureConfirmUi =
    order.status === "ARRIVED" && (order.measuredKg != null || order.finalKg != null);
  // 확인·완료 계산 기준 kg = 중재 확정(finalKg) 우선, 없으면 계량 제출(measuredKg).
  const confirmKg = order.finalKg ?? order.measuredKg ?? 0;
  // [14 J2] 폐유 총액. 상계 주문에서는 이 값이 곧 받을 돈이 아니다 — 신유 대금을 뺀 confirmNet이 실제.
  const confirmWaste = Math.round(confirmKg * order.snapshotPricePerKg);
  // 확인 화면에 띄울 신유 대금. 라이더가 SUBMIT_MEASURE에서 실제 배달한 통수 기준(신청 통수 아님).
  const confirmPurchase = (order.deliveredCans ?? 0) * (order.snapshotFreshCanPrice ?? 0);
  // [14 J4] 확정 전 = 계산값, 완료 후 = 서버가 확정한 netAmount(레거시 null은 cashPaidAmount 폴백).
  // cash_paid_amount는 폐유 총액으로 **동결**돼 있어 그대로 쓰면 금액도 부호도 틀린다.
  const confirmNet = confirmWaste - confirmPurchase;
  const settledNet = order.netAmount ?? order.cashPaidAmount ?? 0;
  const hasPurchase = order.orderKind === "PURCHASE" || order.orderKind === "MIXED";
  // 08 P2/P3: 지급수단 — 계량 제출이 기록한 payout_method. null(레거시·전환기)은 CASH 간주(coalesce).
  const payoutMethod = order.payoutMethod ?? "CASH";
  const isPointPayout = payoutMethod === "POINT";

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

  // 타임라인 각 스텝의 실제 시각. [14 J1] arrived_at 컬럼이 생겨 ARRIVED 노드가 '-'를 벗어난다.
  // COMPLETED는 신규 주문 completed_at 우선, 레거시(구경로)는 delivered_at 폴백. 값이 없으면
  // OrderTimeline이 "-"로 렌더한다(데이터 조작 금지).
  const timelineTimestamps: Partial<Record<OrderStatus, string>> = {};
  if (order.createdAt) timelineTimestamps.REQUESTED = formatTimeOfDay(order.createdAt);
  if (order.acceptedAt) timelineTimestamps.ACCEPTED = formatTimeOfDay(order.acceptedAt);
  if (order.arrivedAt) timelineTimestamps.ARRIVED = formatTimeOfDay(order.arrivedAt);
  if (order.pickedUpAt) timelineTimestamps.PICKED_UP = formatTimeOfDay(order.pickedUpAt);
  const completedTs = order.completedAt ?? order.deliveredAt;
  if (completedTs) timelineTimestamps.COMPLETED = formatTimeOfDay(completedTs);

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

      {/* 지도 → 라이더 카드 → 정보 스탯 카드 → 타임라인.
          12 S3: 지도 센터는 주문의 실제 수거지 좌표(pickup_location 파싱)를 쓴다. 좌표가 없으면
          서울 기본 센터로 프리뷰. [11 M9-b] 데모 ETA는 제거됐고, 지금 표시되는 ETA는 라이더 실좌표
          (broadcast) → directions Edge(카카오모빌리티)의 실 라우팅 값이다. 키 미설정이면 Edge가
          configured:false를 주므로 선·ETA가 자연히 미표시된다(00-domain "가짜 시간 표기 금지" 준수). */}
      {showMapAndTimeline && (
        <MapView
          styleUrl={MAP_STYLE_URL}
          center={
            order.pickupLat != null && order.pickupLng != null
              ? { lat: order.pickupLat, lng: order.pickupLng }
              : { lat: 37.5665, lng: 126.978 }
          }
          markers={
            order.pickupLat != null && order.pickupLng != null
              ? [{ lat: order.pickupLat, lng: order.pickupLng }]
              : []
          }
          riderMarker={riderLoc ? { lat: riderLoc.lat, lng: riderLoc.lng, stale: riderLoc.stale } : null}
          routePath={directions?.path ?? []}
          etaLabel={formatEta(directions?.durationSeconds) ?? undefined}
          pickupLabel={order.pickupAddress}
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
              {confirmNet < 0
                ? `중재 확정 무게 ${formatKg(confirmKg)} — 새 기름 대금 ${isPointPayout ? `포인트 ${formatPoint(-confirmNet)}` : `현금 ${formatKrw(-confirmNet)}`}을 지불하고 확인해 주세요.`
                : confirmNet === 0
                  ? `중재 확정 무게 ${formatKg(confirmKg)} — 폐유 금액과 새 기름 대금이 같아 주고받을 금액이 없어요.`
                  : isPointPayout
                    ? `중재 확정 무게 ${formatKg(confirmKg)} — 확인하시면 포인트 ${formatPoint(confirmNet)}가 적립돼요.`
                    : `중재 확정 무게 ${formatKg(confirmKg)} — 라이더에게 현금 ${formatKrw(confirmNet)}을 받고 확인해 주세요.`}
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
            {/* [14 J2] 상계 내역 — 구매 동반 주문만. 폐유 총액과 신유 대금을 나눠 보여야
                아래 "차액"이 왜 그 금액인지 점주가 확인할 수 있다. */}
            {hasPurchase && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: colors.status.wait }}>폐유 금액</span>
                  <span data-testid="netting-waste-amount" className="oilpick-tabular-nums" style={{ fontSize: 14, fontWeight: 600 }}>
                    {formatKrw(confirmWaste)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: colors.status.wait }}>
                    새 기름 {order.deliveredCans ?? 0}통
                  </span>
                  <span data-testid="netting-purchase-amount" className="oilpick-tabular-nums" style={{ fontSize: 14, fontWeight: 600 }}>
                    −{formatKrw(confirmPurchase)}
                  </span>
                </div>
                <div style={{ height: 1, backgroundColor: surface.border }} />
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: colors.status.wait }}>
                {confirmNet < 0 ? "지불할 금액" : confirmNet === 0 ? "주고받을 금액" : isPointPayout ? "적립될 포인트" : "받을 현금"}
                <PayoutMethodChip method={payoutMethod} />
              </span>
              <span
                data-testid="measure-cash-amount"
                className="oilpick-tabular-nums"
                style={{ fontSize: 18, fontWeight: 700, color: confirmNet < 0 ? colors.status.wait : isPointPayout ? colors.accent.deep : colors.primary.dark }}
              >
                {isPointPayout ? formatPoint(Math.abs(confirmNet)) : formatKrw(Math.abs(confirmNet))}
              </span>
            </div>
          </div>
          {/* 08 G5-③: CONFIRM = "무게 확인 + 지급 확인" 2자 확인 — 수단별 카피 분기.
              POINT는 CONFIRM과 원자적으로 EARN이 발행된다(서버, 08 P3). */}
          <BigButton data-testid="confirm-measure-button" loading={confirming} onClick={handleConfirmMeasure}>
            {confirmNet < 0
              ? `무게 ${formatKg(confirmKg)} 확인 · ${isPointPayout ? `포인트 ${formatPoint(-confirmNet)}` : `현금 ${formatKrw(-confirmNet)}`} 결제하기`
              : confirmNet === 0
                ? `무게 ${formatKg(confirmKg)} 확인 · 거래 완료하기`
                : isPointPayout
                  ? `무게 ${formatKg(confirmKg)} 확인 · 포인트 ${formatPoint(confirmNet)} 적립받기`
                  : `무게 ${formatKg(confirmKg)} 확인 · 현금 ${formatKrw(confirmNet)} 받았어요`}
          </BigButton>
          {isPointPayout && confirmNet > 0 && (
            <p data-testid="point-confirm-caption" style={{ margin: 0, fontSize: 13, color: colors.status.wait, textAlign: "center" }}>
              확인하시면 포인트가 즉시 적립되고 지갑에서 출금 신청할 수 있어요.
            </p>
          )}
          {isPointPayout && confirmNet < 0 && (
            <p data-testid="point-charge-caption" style={{ margin: 0, fontSize: 13, color: colors.status.wait, textAlign: "center" }}>
              확인하시면 새 기름 대금이 보유 포인트에서 즉시 차감돼요.
            </p>
          )}
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

      {/* 08 G5-③: COMPLETED 히어로 — 확정 지급액(cash_paid_amount)을 수단별로 렌더.
          CASH=받은 현금(브랜드 그린), POINT=적립된 포인트(앰버) + [지갑에서 보기]. */}
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
            background: isPointPayout ? gradient.point : gradient.brand,
            boxShadow: elevation.raised,
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
            {settledNet < 0
              ? isPointPayout
                ? "차감된 포인트"
                : "지불한 현금"
              : settledNet === 0
                ? "거래 완료"
                : isPointPayout
                  ? "적립된 포인트"
                  : "받은 현금"}
          </p>
          <p
            data-testid="completed-cash-amount"
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}
          >
            {isPointPayout ? formatPoint(Math.abs(settledNet)) : formatKrw(Math.abs(settledNet))}
          </p>
          {/* [14 J2] 상계 주문은 폐유 총액도 함께 보여 준다 — 히어로 숫자만으로는 왜 그 금액인지 알 수 없다. */}
          {hasPurchase && (
            <p
              data-testid="completed-netting-breakdown"
              style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.8)" }}
            >
              폐유 {formatKrw(order.cashPaidAmount ?? 0)} − 새 기름 {formatKrw(order.purchaseAmount ?? 0)}
            </p>
          )}
          {isPointPayout && (
            <Link
              to="/wallet"
              data-testid="completed-wallet-link"
              style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "#FFFFFF", textDecoration: "underline" }}
            >
              지갑에서 보기
            </Link>
          )}
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

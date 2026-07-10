import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigButton, ErrorScreen, MapView, colors, elevation, gray, radius, surface, useToast } from "@oilpick/ui";
import { INSUFFICIENT_COUPON, estimateCash, formatKg, formatKrw } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useOpenCalls } from "../hooks/useOpenCalls";
import { useSession } from "../hooks/useSession";
import { useCouponBalance } from "../hooks/useCoupons";

/**
 * R3 콜 상세. 03-frontend.md(07 F5): "MapView + 예상 매입 지급액 대형 표시 + 쿠폰 N장 소진 +
 * [수락]". 07 F5 수락 게이트: 잔액 < coupon_cost면 사전에 "쿠폰 부족" + [충전하러 가기] CTA로
 * fail-fast, 수락 API가 INSUFFICIENT_COUPON(409) 반환 시 토스트 + 동일 CTA(동시성 방어는 RPC가
 * 유일 진실, 여기 사전 체크는 UX용).
 *
 * 별도 단건 조회 Edge Function/쿼리를 새로 만들지 않고 useOpenCalls(R2와 동일 목록 쿼리)
 * 캐시에서 id로 찾는다 — RLS p_order_open_calls는 REQUESTED 상태에서만 select를 허용하므로
 * 목록 쿼리 밖에서 단건으로 다시 select해도 동일한 행만 보인다(추가 쿼리를 만들 실익이 없다).
 */
export function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const { data: calls, isLoading } = useOpenCalls(true);
  const { data: couponBalance } = useCouponBalance(session?.user.id);
  const call = calls?.find((c) => c.id === id);

  // 06 E6: mutation 성공/실패 피드백은 전역 토스트로 통일(원시 <Toast> 인라인 렌더 대체).
  const { showToast } = useToast();

  const [accepting, setAccepting] = useState(false);
  // 409 INSUFFICIENT_COUPON 반환 시 CTA를 띄우고 이 페이지에 머문다(사전 체크를 통과한 경합 상황).
  const [gateBlocked, setGateBlocked] = useState(false);

  async function handleAccept() {
    if (!id) return;
    setAccepting(true);
    const result = await invokeEdgeFunction<{ orderId: string; status: string }>("order-accept", {
      orderId: id,
    });
    setAccepting(false);

    if (!result.ok) {
      if (result.code === INSUFFICIENT_COUPON) {
        // 쿠폰 부족: 목록으로 튕기지 않고 CTA를 노출해 바로 충전으로 유도.
        showToast(result.message, { variant: "error" });
        setGateBlocked(true);
        return;
      }
      showToast(result.message, { variant: "error" });
      setTimeout(() => navigate("/", { replace: true }), 1500);
      return;
    }
    showToast("콜을 수락했어요", { variant: "success" });
    navigate("/active", { replace: true });
  }

  if (isLoading) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <div data-testid="call-detail-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
      </main>
    );
  }

  // E2(07 F6-⑦): 만료됐거나 이미 수락된 콜 id로 진입하면 캐시에 없다 — 막다른 길이므로
  // 빈 상태가 아닌 ErrorScreen + [콜 목록으로]로 탈출시킨다.
  if (!call) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <ErrorScreen
          title="콜을 찾을 수 없어요"
          description="이미 다른 라이더가 수락했거나 만료된 콜이에요."
          action={
            <BigButton data-testid="call-detail-back-to-list" onClick={() => navigate("/")}>
              콜 목록으로
            </BigButton>
          }
        />
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      {/* U7 헤더 톤: 뒤로(<, gray-900) + "콜 상세"(중앙). */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="call-detail-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0, color: gray[900], lineHeight: 1 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 16, margin: 0, flex: 1, fontWeight: 700, textAlign: "center", color: gray[900] }}>
          콜 상세
        </h1>
        {/* 좌측 back과 시각적 균형을 맞추기 위한 스페이서. */}
        <span aria-hidden style={{ width: 20 }} />
      </div>

      <MapView
        apiKey={KAKAO_KEY}
        center={{ lat: call.pickupLat, lng: call.pickupLng }}
        markers={[{ lat: call.pickupLat, lng: call.pickupLng }]}
        pickupLabel={call.pickupAddress}
      />

      {/* 주소 + 예상 수거량을 하나의 흰 카드로 묶어 배경 위에 띄운다. */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 16,
          borderRadius: radius.card,
          backgroundColor: surface.card,
          border: `1px solid ${surface.border}`,
          boxShadow: elevation.card,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>수거 주소</p>
          <p data-testid="call-detail-address" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {call.pickupAddress}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>예상 수거량</p>
          <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{formatKg(call.requestedKg)}</p>
        </div>
        {/* 07 F5-④: 소진 쿠폰(coupon_cost). 레거시 주문(null)은 생략. */}
        {call.couponCost != null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>소진 쿠폰</p>
            <p
              data-testid="call-detail-coupon"
              className="oilpick-tabular-nums"
              style={{ margin: 0, fontSize: 16, fontWeight: 600 }}
            >
              쿠폰 {call.couponCost}장 소진
            </p>
          </div>
        )}
      </section>

      {/* 07 F5-④: "수거비"→"예상 매입 지급액"(라이더가 점주에게 낼 현금 = requestedKg×시세). 앰버 히어로. */}
      <section
        data-testid="call-detail-cash"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
          padding: "28px 20px",
          borderRadius: radius.hero,
          backgroundColor: colors.accent.light,
          border: `1px solid ${surface.border}`,
          boxShadow: elevation.card,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: colors.status.wait }}>예상 매입 지급액</p>
        <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: colors.accent.DEFAULT }}>
          {formatKrw(estimateCash(call.requestedKg, call.snapshotPricePerKg))}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>현장 계량 기준으로 확정 · 점주에게 직접 지급</p>
      </section>

      {/* 07 F5-⑤: 수락 게이트. 잔액 < coupon_cost(사전 체크) 또는 409 반환 시 충전 유도 CTA. */}
      {call.couponCost != null && ((couponBalance ?? 0) < call.couponCost || gateBlocked) ? (
        <section
          data-testid="call-accept-gate"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 16,
            borderRadius: radius.card,
            backgroundColor: colors.accent.light,
            border: `1px solid ${surface.border}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: colors.status.danger }}>
            수거쿠폰이 부족해요 (보유 {couponBalance ?? 0}장 / 필요 {call.couponCost}장)
          </p>
          <BigButton
            data-testid="call-charge-cta"
            onClick={() => navigate("/coupons/purchase")}
          >
            충전하러 가기
          </BigButton>
        </section>
      ) : (
        <BigButton data-testid="call-accept-button" loading={accepting} onClick={handleAccept}>
          수락
        </BigButton>
      )}
    </main>
  );
}

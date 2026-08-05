import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigButton, ErrorScreen, MapView, NumberFlow, PageHeader, colors, elevation, gradient, gray, radius, surface, surfaceDark, useToast } from "@oilpick/ui";
import { estimateCash, formatEta, formatKg, formatKrw } from "@oilpick/core";
import { MAP_STYLE_URL } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useDirections } from "../hooks/useDirections";
import { useGeolocation } from "../hooks/useGeolocation";
import { useOpenCalls } from "../hooks/useOpenCalls";

/**
 * R3 콜 상세. 03-frontend.md(08 G6-②): "MapView + 예상 매입 지급액 대형 표시 + [수락]".
 * 08 P1로 쿠폰 게이트가 소멸 — 수락은 무비용이라 잔액 사전 체크·충전 CTA가 없다.
 * 전환기 레거시 쿠폰 주문의 수락이 409 INSUFFICIENT_COUPON으로 거부되면 코어의 한국어
 * 메시지를 그대로 토스트하고 목록으로 복귀한다(충전 플로우 자체가 폐기됨).
 *
 * 별도 단건 조회 Edge Function/쿼리를 새로 만들지 않고 useOpenCalls(R2와 동일 목록 쿼리)
 * 캐시에서 id로 찾는다 — RLS p_order_open_calls는 REQUESTED 상태에서만 select를 허용하므로
 * 목록 쿼리 밖에서 단건으로 다시 select해도 동일한 행만 보인다(추가 쿼리를 만들 실익이 없다).
 */
export function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: calls, isLoading } = useOpenCalls(true);
  const call = calls?.find((c) => c.id === id);

  // [16 L3 §3-1] 수락 판단용 도로거리·소요 칩. 내 위치(권한 거부·실패 시 null → 칩 미표기 폴백)
  // → 수거지 도로 경로. useDirections가 user 앱과 동일한 좌표 절삭+60초 캐시 계약으로 호출량을
  // 억제한다(콜 상세 다건 연속 열람 대비 — 16 L-D7 심사 반영).
  const position = useGeolocation(true);
  const callPoint = call && call.pickupLat != null && call.pickupLng != null ? { lat: call.pickupLat, lng: call.pickupLng } : null;
  const { data: directions } = useDirections(position, callPoint, Boolean(callPoint));
  const routeActive = Boolean(directions?.configured && directions.path.length > 0);
  const roadEta = directions?.configured ? formatEta(directions.durationSeconds) : null;
  const roadKm =
    directions?.configured && directions.distanceMeters != null
      ? (directions.distanceMeters / 1000).toFixed(1)
      : null;

  // 06 E6: mutation 성공/실패 피드백은 전역 토스트로 통일(원시 <Toast> 인라인 렌더 대체).
  const { showToast } = useToast();

  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    if (!id) return;
    setAccepting(true);
    const result = await invokeEdgeFunction<{ orderId: string; status: string }>("order-accept", {
      orderId: id,
    });
    setAccepting(false);

    if (!result.ok) {
      // 409 INSUFFICIENT_COUPON(전환기 레거시 주문) 포함 — 코어 매핑 한국어 메시지를 그대로
      // 토스트하고 목록으로 복귀(08 P1: 충전 CTA 없음, 쿠폰 플로우 폐기).
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
      {/* U7 헤더 톤: 뒤로(<, gray-900) + "콜 상세"(중앙) — 공용 PageHeader 관용구. */}
      <PageHeader title="콜 상세" onBack={() => navigate("/")} backTestId="call-detail-back" />

      <MapView
        styleUrl={MAP_STYLE_URL}
        center={
          call.pickupLat != null && call.pickupLng != null
            ? { lat: call.pickupLat, lng: call.pickupLng }
            : { lat: 37.5665, lng: 126.978 }
        }
        markers={
          call.pickupLat != null && call.pickupLng != null
            ? [{ lat: call.pickupLat, lng: call.pickupLng }]
            : []
        }
        pickupLabel={call.pickupAddress}
        routePath={routeActive ? directions?.path : []}
        etaLabel={routeActive ? (roadEta ?? undefined) : undefined}
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
        {/* [16 L3 §3-1] 수락 판단 정보 — 실제 도로 기준 거리·소요. 위치 권한 거부·키 미설정이면
            이 행 자체가 없다(직선거리는 콜 목록 카드가 이미 표기 — 여기서 지어내지 않는다). */}
        {(roadKm || roadEta) && (
          <div data-testid="call-detail-road" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>도로 기준</p>
            <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {[roadKm ? `${roadKm}km` : null, roadEta].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </section>

      {/* 08 G6-②: "예상 매입 지급액"(requestedKg×스냅샷 시세) 앰버 히어로 유지 — 지급 수단(현금/포인트)은
          현장 계량 제출 때 선택하므로 카피는 수단 중립. */}
      <section
        data-testid="call-detail-cash"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
          padding: "28px 20px",
          borderRadius: radius.hero,
          // [15] 목업의 다크 지급액 히어로 — 수락 판단의 근거가 되는 단 하나의 숫자.
          background: `radial-gradient(circle at 82% 12%, ${colors.lime.soft}, transparent 40%), ${gradient.heroDeep}`,
          boxShadow: elevation.heroDark,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: surfaceDark.textOnDarkMuted }}>예상 매입 지급액</p>
        {/* [15] 콜을 열면 금액이 카운트업한다 — 수락 판단의 주인공 숫자. */}
        {/* [M] 확대 시 fontSize를 폭에 맞춰 줄인다(clamp) — 금액 자릿수 중간 절단 금지. */}
        <p style={{ margin: 0, width: "100%", minWidth: 0, textAlign: "center" }}>
          <NumberFlow
            value={estimateCash(call.requestedKg, call.snapshotPricePerKg)}
            format={(n) => formatKrw(Math.round(n))}
            style={{ fontSize: "clamp(28px, 9vw, 40px)", fontWeight: 800, letterSpacing: "-0.02em", color: surfaceDark.textOnDark }}
          />
        </p>
        <p style={{ margin: 0, fontSize: 12, color: surfaceDark.textOnDarkMuted }}>현장 계량 기준으로 확정 · 현금 또는 포인트로 지급</p>
      </section>

      <BigButton data-testid="call-accept-button" loading={accepting} onClick={handleAccept}>
        수락
      </BigButton>
    </main>
  );
}

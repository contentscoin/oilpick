import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigButton, MapView, Toast, colors, elevation, radius, surface } from "@oilpick/ui";
import { formatKg, formatKrw } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useOpenCalls } from "../hooks/useOpenCalls";

/**
 * R3 콜 상세. 03-frontend.md: "MapView + 수거비 대형 표시 + [수락](order-accept 호출, 409면
 * '다른 라이더가 수락했어요' 토스트 후 목록 복귀)".
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

  const [accepting, setAccepting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleAccept() {
    if (!id) return;
    setAccepting(true);
    const result = await invokeEdgeFunction<{ orderId: string; status: string }>("order-accept", {
      orderId: id,
    });
    setAccepting(false);

    if (!result.ok) {
      setToast(result.message);
      setTimeout(() => navigate("/", { replace: true }), 1500);
      return;
    }
    navigate("/active", { replace: true });
  }

  if (isLoading) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <div data-testid="call-detail-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: "#f4f4f5" }} />
      </main>
    );
  }

  if (!call) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <p>콜을 찾을 수 없어요. 이미 다른 라이더가 수락했을 수 있어요.</p>
        <BigButton data-testid="call-detail-back-to-list" onClick={() => navigate("/")}>
          목록으로
        </BigButton>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="call-detail-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>콜 상세</h1>
      </div>

      {toast && <Toast data-testid="call-accept-toast" message={toast} variant="error" />}

      <MapView apiKey={KAKAO_KEY} center={{ lat: call.pickupLat, lng: call.pickupLng }} markers={[{ lat: call.pickupLat, lng: call.pickupLng }]} />

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
      </section>

      {/* 05-design-upgrade.md R3: 수거비 앰버 강조. 앰버 히어로 카드로 격상. */}
      <section
        data-testid="call-detail-fee"
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
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: colors.status.wait }}>수거비</p>
        <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: colors.accent.DEFAULT }}>
          {formatKrw(call.snapshotRiderFee)}
        </p>
      </section>

      <BigButton data-testid="call-accept-button" loading={accepting} onClick={handleAccept}>
        수락
      </BigButton>
    </main>
  );
}

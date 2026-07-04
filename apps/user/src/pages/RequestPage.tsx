import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, QtyStepper, colors, radius } from "@oilpick/ui";
import {
  estimateKg,
  estimatePoint,
  formatKg,
  formatPoint,
  orderCreateInputSchema,
  type OrderCreateOutput,
} from "@oilpick/core";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useSession } from "../hooks/useSession";
import { useLatestPriceTick } from "../hooks/usePriceTicks";
import { useProfile } from "../hooks/useProfile";
import { AddressField, type AddressValue } from "../components/AddressField";

/**
 * U5 요청 3스텝. 03-frontend.md:
 * "step1 수량 / step2 주소·희망시간(기본: 프로필 주소, '지금') / step3 확인+'현장 계량 기준'
 * 고지 → order-create 호출 → /orders/:id 이동".
 *
 * 수량은 QtyStepper(packages/ui) 재사용 — 통 수(정수)만 전달하므로 requestedKg는
 * estimateKg로 환산해 order-create 입력에 채운다(QtyStepper 자체 kg 토글은 표시 보조용).
 */

type Step = 1 | 2 | 3;

const DEFAULT_ADDRESS: AddressValue = { address: "", lat: 37.5509, lng: 126.8225 };

export function RequestPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile } = useProfile(userId);
  const { data: latestTick } = useLatestPriceTick();

  const [step, setStep] = useState<Step>(1);
  const [cans, setCans] = useState(1);
  const [address, setAddress] = useState<AddressValue>(DEFAULT_ADDRESS);
  const [addressInitialized, setAddressInitialized] = useState(false);
  const [preferredTime, setPreferredTime] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step2 진입 시 1회, 프로필 주소를 기본값으로 채운다(03-frontend.md "기본값: 프로필 주소").
  // 프로필 로딩이 비동기라 useState 초기값으로는 못 채우므로 데이터가 도착한 첫 렌더에만 적용.
  if (!addressInitialized && profile?.address) {
    setAddressInitialized(true);
    setAddress((prev) => (prev.address ? prev : { ...prev, address: profile.address }));
  }

  const estimatedKg = estimateKg(cans);
  const estimatedPoint = latestTick ? estimatePoint(estimatedKg, latestTick.pricePerKg) : 0;
  const preferredTimeValue = preferredTime === "now" ? "지금" : customTime;

  async function handleSubmit() {
    if (!userId) return;
    setError(null);

    const parsed = orderCreateInputSchema.safeParse({
      requestedCans: cans,
      requestedKg: estimatedKg,
      address: address.address,
      lat: address.lat,
      lng: address.lng,
      preferredTime: preferredTimeValue,
    });
    if (!parsed.success) {
      setError("입력값을 확인해주세요.");
      return;
    }

    setSubmitting(true);
    const result = await invokeEdgeFunction<OrderCreateOutput>("order-create", parsed.data);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    navigate(`/orders/${result.data.orderId}`, { replace: true });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="request-back"
          aria-label="뒤로가기"
          onClick={() => (step === 1 ? navigate(-1) : setStep((s) => (s - 1) as Step))}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>수거 요청</h1>
      </div>

      <div data-testid="request-step-indicator" style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            aria-hidden
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: s <= step ? colors.primary.DEFAULT : "#e4e4e7",
            }}
          />
        ))}
      </div>

      {error && (
        <p role="alert" data-testid="request-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      {step === 1 && (
        <section data-testid="request-step-1" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>수거 수량을 알려주세요</h2>
          <QtyStepper value={cans} onChange={setCans} />
          <BigButton data-testid="request-step-1-next" onClick={() => setStep(2)}>
            다음
          </BigButton>
        </section>
      )}

      {step === 2 && (
        <section data-testid="request-step-2" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>수거 장소와 희망 시간</h2>
          <AddressField value={address} onChange={setAddress} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>희망 시간</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                data-testid="preferred-time-now"
                aria-pressed={preferredTime === "now"}
                onClick={() => setPreferredTime("now")}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: radius.button,
                  border: `1px solid ${preferredTime === "now" ? colors.primary.DEFAULT : "#e4e4e7"}`,
                  backgroundColor: preferredTime === "now" ? colors.primary.light : "#fff",
                  color: preferredTime === "now" ? colors.primary.dark : "#333",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                지금
              </button>
              <button
                type="button"
                data-testid="preferred-time-custom"
                aria-pressed={preferredTime === "custom"}
                onClick={() => setPreferredTime("custom")}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: radius.button,
                  border: `1px solid ${preferredTime === "custom" ? colors.primary.DEFAULT : "#e4e4e7"}`,
                  backgroundColor: preferredTime === "custom" ? colors.primary.light : "#fff",
                  color: preferredTime === "custom" ? colors.primary.dark : "#333",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                날짜/시간 지정
              </button>
            </div>
            {preferredTime === "custom" && (
              <input
                data-testid="preferred-time-custom-input"
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                style={{
                  minHeight: 48,
                  borderRadius: radius.button,
                  border: "1px solid #e4e4e7",
                  padding: "0 14px",
                  fontSize: 16,
                }}
              />
            )}
          </div>

          <BigButton
            data-testid="request-step-2-next"
            disabled={!address.address || (preferredTime === "custom" && !customTime)}
            onClick={() => setStep(3)}
          >
            다음
          </BigButton>
        </section>
      )}

      {step === 3 && (
        <section data-testid="request-step-3" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>요청 내용을 확인해주세요</h2>

          <div style={{ borderRadius: radius.card, backgroundColor: "#fafafa", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <Row label="수량" value={`${cans}통 (약 ${formatKg(estimatedKg)})`} />
            <Row label="수거 주소" value={address.address} />
            <Row label="희망 시간" value={preferredTimeValue} />
          </div>

          <div
            data-testid="request-estimated-point"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              borderRadius: radius.card,
              backgroundColor: colors.accent.light,
            }}
          >
            <span style={{ fontSize: 14, color: colors.status.wait }}>예상 지급 포인트</span>
            <span className="oilpick-tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: colors.accent.DEFAULT }}>
              {formatPoint(estimatedPoint)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
            실제 지급 포인트는 현장 계량 기준으로 확정됩니다.
          </p>

          <BigButton data-testid="request-submit" loading={submitting} onClick={handleSubmit}>
            수거 요청하기
          </BigButton>
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 14, color: colors.status.wait }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

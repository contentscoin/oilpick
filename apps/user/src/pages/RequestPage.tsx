import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BigButton,
  ConfirmSheet,
  QtyStepper,
  colors,
  gray,
  inputClassName,
  inputStyle,
  radius,
  surface,
} from "@oilpick/ui";
import {
  estimateCash,
  estimateKg,
  formatKg,
  formatKrw,
  orderCreateInputSchema,
  type OrderCreateOutput,
} from "@oilpick/core";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useSession } from "../hooks/useSession";
import { useLatestPriceTick } from "../hooks/usePriceTicks";
import { useProfile } from "../hooks/useProfile";
import { useRecentAddresses, type RecentAddress } from "../hooks/useRecentAddresses";
import { AddressField, type AddressValue } from "../components/AddressField";

/**
 * U5 요청 3스텝. 03-frontend.md(07 F9 개정): 3스텝 골격 유지 +
 * ① 전 스텝 공통 sticky 예상 현금 수령액 푸터 ② 최근 주소 재사용 칩 ③ 통 크기 프리셋
 * ④ 희망시간 퀵칩 ⑤ 제출 성공 ConfirmSheet + 스텝 인디케이터.
 *
 * 카피는 신모델(07 D1): "예상 포인트" → "예상 현금 수령액"(P → 원). coupon_cost는 서버가
 * requestedKg 기준으로 산정하므로(07 §1-2) 클라이언트는 kg만 정확히 보내면 된다.
 */

type Step = 1 | 2 | 3;
type CanSize = "18" | "10" | "etc";
type TimeChip = "now" | "todayPM" | "tomorrowAM" | "custom";

const DEFAULT_ADDRESS: AddressValue = { address: "", lat: 37.5509, lng: 126.8225 };

const CAN_SIZE_OPTIONS: { value: CanSize; label: string; liters: number | null }[] = [
  { value: "18", label: "18L 말통", liters: 18 },
  { value: "10", label: "10L", liters: 10 },
  { value: "etc", label: "기타(직접 입력)", liters: null },
];

const STEP_LABELS: Record<Step, string> = { 1: "수량", 2: "장소·시간", 3: "확인" };

/** Date → preferred_time 텍스트 'YYYY-MM-DD HH:mm' (01-db-schema.sql preferred_time 규약). */
function formatPreferredDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 퀵칩 → preferred_time 텍스트. 오늘 오후=14:00, 내일 오전=09:00. */
function resolvePreferredTime(chip: TimeChip, customTime: string): string {
  if (chip === "now") return "지금";
  if (chip === "custom") return customTime ? customTime.replace("T", " ") : "";
  const now = new Date();
  if (chip === "todayPM") {
    const d = new Date(now);
    d.setHours(14, 0, 0, 0);
    return formatPreferredDateTime(d);
  }
  // tomorrowAM
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return formatPreferredDateTime(d);
}

export function RequestPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile } = useProfile(userId);
  const { data: latestTick } = useLatestPriceTick();
  const { data: recentAddresses } = useRecentAddresses(userId);

  const [step, setStep] = useState<Step>(1);
  const [canSize, setCanSize] = useState<CanSize>("18");
  const [cans, setCans] = useState(1);
  const [customKg, setCustomKg] = useState("");
  const [address, setAddress] = useState<AddressValue>(DEFAULT_ADDRESS);
  const [addressInitialized, setAddressInitialized] = useState(false);
  const [timeChip, setTimeChip] = useState<TimeChip>("now");
  const [customTime, setCustomTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ orderId: string; cash: number } | null>(null);

  // step2 진입 시 1회, 프로필 주소를 기본값으로 채운다(03-frontend.md "기본값: 프로필 주소").
  if (!addressInitialized && profile?.address) {
    setAddressInitialized(true);
    setAddress((prev) => (prev.address ? prev : { ...prev, address: profile.address }));
  }

  const parsedKg = Number(customKg);
  const customKgValid = Number.isFinite(parsedKg) && parsedKg >= 1 && parsedKg <= 500;
  const estimatedKg =
    canSize === "etc"
      ? customKgValid
        ? parsedKg
        : 0
      : estimateKg(cans, canSize === "10" ? 10 : 18);
  const estimatedCash = latestTick ? estimateCash(estimatedKg, latestTick.pricePerKg) : 0;
  const preferredTimeValue = resolvePreferredTime(timeChip, customTime);

  const step1Valid = canSize === "etc" ? customKgValid : cans >= 1;

  function applyRecentAddress(recent: RecentAddress) {
    setAddress({ address: recent.address, lat: recent.lat, lng: recent.lng });
  }

  async function handleSubmit() {
    if (!userId) return;
    setError(null);

    const parsed = orderCreateInputSchema.safeParse({
      requestedCans: canSize === "etc" ? undefined : cans,
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

    // 07 F9-⑤: 성공 시 즉시 이동하지 않고 완료 시트를 띄운다(예상 수령액 안내 + 다음 행동 선택).
    setSuccess({ orderId: result.data.orderId, cash: result.data.estimatedCash });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, paddingBottom: 108, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="request-back"
          aria-label="뒤로가기"
          onClick={() => (step === 1 ? navigate(-1) : setStep((s) => (s - 1) as Step))}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -12, background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>수거 요청</h1>
      </div>

      {/* 스텝 인디케이터: 1/2/3 도트 + 라벨. */}
      <div data-testid="request-step-indicator" style={{ display: "flex", gap: 8 }}>
        {([1, 2, 3] as Step[]).map((s) => {
          const activeOrDone = s <= step;
          return (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden
                data-testid={`request-step-dot-${s}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: activeOrDone ? colors.primary.DEFAULT : surface.border,
                  color: activeOrDone ? "#fff" : colors.status.wait,
                }}
              >
                {s}
              </span>
              <span style={{ fontSize: 12, fontWeight: s === step ? 700 : 500, color: s === step ? colors.primary.dark : colors.status.wait }}>
                {STEP_LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" data-testid="request-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      {step === 1 && (
        <section data-testid="request-step-1" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>수거 수량을 알려주세요</h2>

          {/* 통 크기 프리셋(18L 말통/10L/기타). */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>통 크기</span>
            <div data-testid="can-size-preset" style={{ display: "flex", gap: 8 }}>
              {CAN_SIZE_OPTIONS.map((opt) => {
                const selected = canSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`can-size-${opt.value}`}
                    aria-pressed={selected}
                    onClick={() => setCanSize(opt.value)}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderRadius: radius.button,
                      border: `1px solid ${selected ? colors.primary.DEFAULT : surface.border}`,
                      backgroundColor: selected ? colors.primary.light : "#fff",
                      color: selected ? colors.primary.dark : "#333",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {canSize === "etc" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="custom-kg-input" style={{ fontSize: 14, fontWeight: 600 }}>
                예상 무게 (kg)
              </label>
              <input
                id="custom-kg-input"
                data-testid="custom-kg-input"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="500"
                placeholder="예: 40"
                value={customKg}
                onChange={(e) => setCustomKg(e.target.value)}
                className={inputClassName}
                style={inputStyle}
              />
              <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>1~500kg 사이로 입력해주세요.</p>
            </div>
          ) : (
            <QtyStepper value={cans} onChange={setCans} />
          )}

          <BigButton data-testid="request-step-1-next" disabled={!step1Valid} onClick={() => setStep(2)}>
            다음
          </BigButton>
        </section>
      )}

      {step === 2 && (
        <section data-testid="request-step-2" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>수거 장소와 희망 시간</h2>

          {/* 최근 주소 재사용 칩(본인 완료 주문 distinct 최근 2건). */}
          {recentAddresses && recentAddresses.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: colors.status.wait }}>최근 사용한 주소</span>
              <div data-testid="recent-address-chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recentAddresses.map((recent, i) => (
                  <button
                    key={`${recent.address}-${i}`}
                    type="button"
                    data-testid={`recent-address-chip-${i}`}
                    onClick={() => applyRecentAddress(recent)}
                    style={{
                      maxWidth: "100%",
                      padding: "8px 14px",
                      borderRadius: radius.pill,
                      border: `1px solid ${surface.border}`,
                      backgroundColor: gray[50],
                      color: gray[900],
                      fontSize: 13,
                      cursor: "pointer",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    📍 {recent.address}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AddressField value={address} onChange={setAddress} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>희망 시간</span>
            <div data-testid="preferred-time-chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  { value: "now", label: "지금" },
                  { value: "todayPM", label: "오늘 오후" },
                  { value: "tomorrowAM", label: "내일 오전" },
                  { value: "custom", label: "직접 지정" },
                ] as { value: TimeChip; label: string }[]
              ).map((chip) => {
                const selected = timeChip === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    data-testid={`preferred-time-${chip.value}`}
                    aria-pressed={selected}
                    onClick={() => setTimeChip(chip.value)}
                    style={{
                      minHeight: 44,
                      padding: "0 16px",
                      borderRadius: radius.pill,
                      border: `1px solid ${selected ? colors.primary.DEFAULT : surface.border}`,
                      backgroundColor: selected ? colors.primary.light : "#fff",
                      color: selected ? colors.primary.dark : "#333",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            {timeChip === "custom" && (
              <input
                data-testid="preferred-time-custom-input"
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className={inputClassName}
                style={inputStyle}
              />
            )}
          </div>

          <BigButton
            data-testid="request-step-2-next"
            disabled={!address.address || (timeChip === "custom" && !customTime)}
            onClick={() => setStep(3)}
          >
            다음
          </BigButton>
        </section>
      )}

      {step === 3 && (
        <section data-testid="request-step-3" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>요청 내용을 확인해주세요</h2>

          <div style={{ borderRadius: radius.card, backgroundColor: gray[50], padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <Row
              label="수량"
              value={
                canSize === "etc"
                  ? `약 ${formatKg(estimatedKg)}`
                  : `${cans}통 (${CAN_SIZE_OPTIONS.find((o) => o.value === canSize)?.label} · 약 ${formatKg(estimatedKg)})`
              }
            />
            <Row label="수거 주소" value={address.address} />
            <Row label="희망 시간" value={preferredTimeValue} />
          </div>

          <BigButton data-testid="request-submit" loading={submitting} onClick={handleSubmit}>
            수거 요청하기
          </BigButton>
        </section>
      )}

      {/* ① 전 스텝 공통 sticky 예상 현금 수령액 푸터. */}
      <div
        data-testid="request-estimate-footer"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
          borderTop: `1px solid ${surface.border}`,
          boxShadow: "0 -2px 12px rgba(0,0,0,0.05)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, color: colors.status.wait }}>예상 현금 수령액</span>
            <span
              data-testid="request-estimate-cash"
              className="oilpick-tabular-nums"
              style={{ fontSize: 22, fontWeight: 800, color: colors.primary.dark }}
            >
              {formatKrw(estimatedCash)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>현장 계량 기준으로 확정돼요</p>
        </div>
      </div>

      {/* ⑤ 제출 성공 완료 시트(ConfirmSheet 재사용). [주문 상세 보기]/[홈으로]. */}
      <ConfirmSheet
        open={success != null}
        onClose={() => navigate("/", { replace: true })}
        title="요청이 접수됐어요"
        description={`예상 수령액 ${formatKrw(success?.cash ?? 0)} · 현장 계량 기준으로 확정돼요.`}
        confirmLabel="주문 상세 보기"
        cancelLabel="홈으로"
        onConfirm={() => success && navigate(`/orders/${success.orderId}`, { replace: true })}
      />
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

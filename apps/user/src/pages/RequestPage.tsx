import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BigButton,
  ConfirmSheet,
  NumberFlow,
  PageHeader,
  QtyStepper,
  colors,
  elevation,
  frameFixedStyle,
  gray,
  inputClassName,
  inputStyle,
  radius,
  surface,
  surfaceDark,
} from "@oilpick/ui";
import {
  estimateCash,
  estimateKg,
  estimatePurchase,
  formatKg,
  formatKrw,
  orderCreateInputSchema,
  type OrderCreateOutput,
} from "@oilpick/core";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { useSession } from "../hooks/useSession";
import { useLatestPriceTick } from "../hooks/usePriceTicks";
import { useFreshOilPrice } from "../hooks/useFreshOilPrice";
import { useProfile } from "../hooks/useProfile";
import { useRecentAddresses, type RecentAddress } from "../hooks/useRecentAddresses";
import { AddressField, type AddressValue } from "../components/AddressField";

/**
 * U5 요청 3스텝. 03-frontend.md(07 F9 개정): 3스텝 골격 유지 +
 * ① 전 스텝 공통 sticky 예상 수령액 푸터(08 G5-⑥ 수단 중립 카피) ② 최근 주소 재사용 칩 ③ 통 크기 프리셋
 * ④ 희망시간 퀵칩 ⑤ 제출 성공 ConfirmSheet + 스텝 인디케이터.
 *
 * 카피는 08 신모델: "예상 수령액"(지급수단은 현장에서 현금/포인트 중 결정 — 수단 중립). requestedKg는 서버가
 * requestedKg 기준으로 산정하므로(07 §1-2) 클라이언트는 kg만 정확히 보내면 된다.
 */

type Step = 1 | 2 | 3;
type TimeChip = "now" | "todayPM" | "tomorrowAM" | "custom";

// 좌표는 주소 검색·지오코딩으로 확정되기 전까지 null(12 S2 — 기본 좌표 저장 금지).
const DEFAULT_ADDRESS: AddressValue = { address: "", lat: null, lng: null };

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
  const [searchParams] = useSearchParams();
  // [14 J2] ?mode=purchase면 신유 단독 신청 모드로 진입 — 폐유 0, 신유 1통에서 시작.
  const purchaseMode = searchParams.get("mode") === "purchase";
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile } = useProfile(userId);
  const { data: latestTick } = useLatestPriceTick();
  const { data: freshTick } = useFreshOilPrice();
  const { data: recentAddresses } = useRecentAddresses(userId);

  const [step, setStep] = useState<Step>(1);
  const [cans, setCans] = useState(purchaseMode ? 0 : 1);
  const [purchaseCans, setPurchaseCans] = useState(purchaseMode ? 1 : 0);
  const [address, setAddress] = useState<AddressValue>(DEFAULT_ADDRESS);
  const [addressInitialized, setAddressInitialized] = useState(false);
  const [timeChip, setTimeChip] = useState<TimeChip>("now");
  const [customTime, setCustomTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ orderId: string; label: string; amount: number } | null>(null);

  // step2 진입 시 1회, 프로필 주소를 기본값으로 채운다(03-frontend.md "기본값: 프로필 주소").
  if (!addressInitialized && profile?.address) {
    setAddressInitialized(true);
    setAddress((prev) => (prev.address ? prev : { ...prev, address: profile.address }));
  }

  // [14 §6] 통 개수만 선택 → estimateKg(cans) = 통 × KG_PER_CAN(18L 말통 기준).
  const estimatedKg = estimateKg(cans);
  const wasteCash = latestTick ? estimateCash(estimatedKg, latestTick.pricePerKg) : 0;
  // [14 J2] 신유 구매 대금·상계 미리보기(신유 tick 있을 때만 신청 가능).
  const canBuyFresh = freshTick != null;
  const hasPurchase = canBuyFresh && purchaseCans >= 1;
  const purchaseAmount = hasPurchase && freshTick ? estimatePurchase(purchaseCans, freshTick.pricePerCan) : 0;
  const netEstimate = wasteCash - purchaseAmount; // 양수=점주 수령, 음수=점주 결제
  // sticky 푸터: 상계가 있으면 순액(수령/결제), 순수 수거면 예상 수령액.
  const footerLabel = hasPurchase
    ? netEstimate >= 0
      ? "예상 수령액(상계 후)"
      : "예상 결제액(상계 후)"
    : "예상 수령액";
  const footerAmount = hasPurchase ? Math.abs(netEstimate) : wasteCash;
  const preferredTimeValue = resolvePreferredTime(timeChip, customTime);

  // 폐유 수거 또는 신유 구매 중 하나는 있어야 다음 단계로 진행 가능(구매-only 허용).
  const step1Valid = cans >= 1 || hasPurchase;

  /**
   * [15] 스텝 CTA를 sticky 푸터로 끌어내린다. 예전엔 CTA가 폼 바로 아래(화면 위쪽)에 있고
   * 금액 바만 뷰포트 바닥에 fixed라, 화면이 길면 "얼마 받는지"와 "다음으로 간다"가 수백 px
   * 떨어져 보였다. 목업처럼 금액과 액션을 한 덩어리로 둔다.
   */
  const stepCta =
    step === 1
      ? { testId: "request-step-1-next", label: "다음", disabled: !step1Valid, loading: false, onClick: () => setStep(2) }
      : step === 2
        ? {
            testId: "request-step-2-next",
            label: "다음",
            disabled:
              !address.address ||
              address.lat == null ||
              address.lng == null ||
              (timeChip === "custom" && !customTime),
            loading: false,
            onClick: () => setStep(3),
          }
        : { testId: "request-submit", label: "수거 요청하기", disabled: false, loading: submitting, onClick: handleSubmit };

  function applyRecentAddress(recent: RecentAddress) {
    setAddress({ address: recent.address, lat: recent.lat, lng: recent.lng });
  }

  async function handleSubmit() {
    if (!userId) return;
    setError(null);

    const parsed = orderCreateInputSchema.safeParse({
      // 구매-only(폐유 0)면 requestedCans는 보내지 않는다(positive 제약). requestedKg는 0.
      requestedCans: cans >= 1 ? cans : undefined,
      requestedKg: estimatedKg,
      purchaseCans: hasPurchase ? purchaseCans : undefined,
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

    // 07 F9-⑤: 성공 시 즉시 이동하지 않고 완료 시트를 띄운다(예상 금액 안내 + 다음 행동 선택).
    // [14 J2] 상계가 있으면 순액(수령/결제)을, 순수 수거면 예상 수령액을 안내한다.
    const successInfo = hasPurchase
      ? netEstimate >= 0
        ? { label: "예상 수령액(상계 후)", amount: netEstimate }
        : { label: "예상 결제액(상계 후)", amount: -netEstimate }
      : { label: "예상 수령액", amount: result.data.estimatedCash };
    setSuccess({ orderId: result.data.orderId, ...successInfo });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, paddingBottom: 184, maxWidth: 480, margin: "0 auto" }}>
      {/* step>1이면 뒤로가 스텝 후퇴(라우트 이탈은 step 1에서만) — 기존 로직 유지. */}
      <PageHeader
        title="수거 요청"
        onBack={() => (step === 1 ? navigate(-1) : setStep((s) => (s - 1) as Step))}
        backTestId="request-back"
      />

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
          <h2 style={{ fontSize: 16, margin: 0 }}>수거할 통 개수를 알려주세요</h2>

          {/* [14 §6] 18L 말통 개수만 선택. 통크기·kg 직접입력 제거 — 정확한 무게는 현장 계량으로 확정.
              [14 J2] min 0 허용 — 신유만 받는 경우 폐유 0으로 둘 수 있다. */}
          <QtyStepper
            value={cans}
            onChange={setCans}
            min={0}
            subLabel={cans === 0 ? "폐유 없이 새 기름만 받기" : undefined}
          />
          <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
            18L 말통 기준이에요. 정확한 무게는 현장 계량으로 확정돼요.
          </p>

          {/* [14 J2] 신유(새 식용유) 구매 — 고시가 tick이 있을 때만 노출. */}
          {canBuyFresh && freshTick && (
            <div
              data-testid="request-fresh-section"
              style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${surface.border}`, paddingTop: 16 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>새 기름도 받으시겠어요?</h2>
                <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
                  18L 1통 · {formatKrw(freshTick.pricePerCan)} — 수거 대금과 상계돼요.
                </p>
              </div>
              <QtyStepper
                value={purchaseCans}
                onChange={setPurchaseCans}
                min={0}
                max={50}
                subLabel={
                  purchaseCans === 0
                    ? "필요 없으면 0으로 두세요"
                    : `${formatKrw(purchaseAmount)} · 18L ${purchaseCans}통`
                }
              />
            </div>
          )}

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

        </section>
      )}

      {step === 3 && (
        <section data-testid="request-step-3" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>요청 내용을 확인해주세요</h2>

          <div style={{ borderRadius: radius.card, backgroundColor: gray[50], padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {cans >= 1 && <Row label="폐유 수거" value={`${cans}통 (약 ${formatKg(estimatedKg)})`} />}
            {hasPurchase && <Row label="새 기름 구매" value={`${purchaseCans}통 · ${formatKrw(purchaseAmount)}`} />}
            {hasPurchase && (
              <Row
                label={netEstimate >= 0 ? "예상 수령액(상계)" : "예상 결제액(상계)"}
                value={formatKrw(Math.abs(netEstimate))}
              />
            )}
            <Row label="수거 주소" value={address.address} />
            <Row label="희망 시간" value={preferredTimeValue} />
          </div>

        </section>
      )}

      {/* ① 전 스텝 공통 sticky 예상 수령액 푸터(수단 중립 — 08 G5-⑥). */}
      <div
        data-testid="request-estimate-footer"
        style={{
          ...frameFixedStyle,
          bottom: 0,
          backgroundColor: surface.card,
          borderTop: `1px solid ${surface.border}`,
          boxShadow: "0 -2px 12px rgba(0,0,0,0.05)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* [15] 목업의 다크 예상액 바 — 이 화면에서 점주가 확인해야 할 단 하나의 숫자라
            흰 폼 위에서 톤을 분리해 띄운다. */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderRadius: radius.card,
              backgroundColor: surfaceDark.panel,
              boxShadow: elevation.heroDark,
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: surfaceDark.textOnDarkMuted }}>{footerLabel}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>현장 계량·상계 기준으로 확정돼요</span>
            </span>
            {/* [15] 통 수·신유 수량을 바꾸면 금액이 굴러가듯 갱신된다 — "값이 바뀌었다"는 사실 자체를
                말하는 자리. 접근성 트리에는 언제나 최종 금액만 노출된다. */}
            <NumberFlow
              testId="request-estimate-cash"
              value={footerAmount}
              format={(n) => formatKrw(Math.round(n))}
              style={{ fontSize: 24, fontWeight: 800, color: surfaceDark.textOnDark, whiteSpace: "nowrap" }}
            />
          </div>
          <BigButton
            data-testid={stepCta.testId}
            disabled={stepCta.disabled}
            loading={stepCta.loading}
            onClick={stepCta.onClick}
          >
            {stepCta.label}
          </BigButton>
        </div>
      </div>

      {/* ⑤ 제출 성공 완료 시트(ConfirmSheet 재사용). [주문 상세 보기]/[홈으로]. */}
      <ConfirmSheet
        open={success != null}
        onClose={() => navigate("/", { replace: true })}
        title="요청이 접수됐어요"
        description={`${success?.label ?? "예상 수령액"} ${formatKrw(success?.amount ?? 0)} · 현장 계량·상계 기준으로 확정돼요.`}
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

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BigButton, EmptyState, colors, elevation, gray, radius, surface } from "@oilpick/ui";
import {
  formatKrw,
  type CouponPurchaseIntentOutput,
  type CouponPurchaseConfirmOutput,
} from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useCouponPrice, usePendingPurchases, type PendingPurchase } from "../hooks/useCoupons";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { PG_PROVIDER, TOSS_CLIENT_KEY } from "../lib/env";
import { loadTossWidget, type TossWidgetHandle, type TossWidgetLoader } from "../lib/tossWidget";

/**
 * R: 쿠폰 결제 화면 `/coupons/purchase` (07 F4-⑤, F14 코엠 분기). 수량 프리셋(10/30/50)+직접 입력
 * → 예상 금액(단가×수량) → [결제하기] → intent →
 *  - 토스: 결제위젯 렌더 → requestPayment → successUrl 콜백에서 confirm.
 *  - 코엠: intent가 반환한 결제창 파라미터(koem)를 hidden form으로 그대로 POST(현재 창 이동).
 *    승인 확정은 서버 콜백(coupon-purchase-return)이 처리하므로 이 화면의 confirm 경로는
 *    사용하지 않는다 — 재진입 시 PENDING 목록에서 "결제 상태 새로고침"으로 반영을 확인한다.
 * orphan 대사: PENDING 잔건 목록(07 §1-4 ⓐ). SDK·폼 제출은 주입 가능(테스트 모킹).
 * 콜홈 진입점(잔액 카드)은 F5 소관 — 이 태스크는 라우트 직접 진입만으로 동작한다.
 */
const QTY_PRESETS = [10, 30, 50];
const QTY_MIN = 1;
const QTY_MAX = 200;

type Phase = "select" | "widget" | "confirming" | "success" | "fail";

interface PendingPay {
  purchaseId: string;
  pgOrderId: string;
  amount: number;
  qty: number;
}

/** 코엠 결제창 진입 — intent가 만든 파라미터를 수정 없이 현재 창에서 form POST(07 F14). */
function submitKoemPayForm(payUrl: string, params: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payUrl;
  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export interface CouponPurchasePageProps {
  /** 결제위젯 로더(테스트 주입). 기본값은 실 SDK 로더. */
  loadWidget?: TossWidgetLoader;
  /** 토스 클라이언트 키. 기본값은 env(미발급 시 undefined → 안내 폴백). */
  clientKey?: string;
  /** 활성 PG(테스트 주입). 기본값은 env VITE_PG_PROVIDER(미설정 시 toss). */
  pgProvider?: "toss" | "koem";
  /** 코엠 결제창 form 제출(테스트 주입 — jsdom은 form.submit 미구현). */
  submitPayForm?: (payUrl: string, params: Record<string, string>) => void;
}

export function CouponPurchasePage({
  loadWidget = loadTossWidget,
  clientKey = TOSS_CLIENT_KEY,
  pgProvider = PG_PROVIDER,
  submitPayForm = submitKoemPayForm,
}: CouponPurchasePageProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useSession();
  const riderId = session?.user.id;

  const { data: unitPrice } = useCouponPrice();
  const { data: pending, refetch: refetchPending } = usePendingPurchases(riderId);

  // successUrl 콜백 파라미터(confirm 모드) — Toss가 successUrl에 paymentKey/orderId/amount를 덧붙이고,
  // 우리는 successUrl에 purchaseId를 미리 심어둔다(intent 반환 uuid, orderId=pg_order_id와 별개).
  const cbPaymentKey = searchParams.get("paymentKey");
  const cbPurchaseId = searchParams.get("purchaseId");
  const cbOrderId = searchParams.get("orderId");
  const cbAmount = searchParams.get("amount");
  const isConfirmCallback = Boolean(cbPaymentKey && cbPurchaseId && cbOrderId && cbAmount);
  const isFailCallback = searchParams.get("fail") === "1" || Boolean(searchParams.get("code"));

  const [phase, setPhase] = useState<Phase>(
    isConfirmCallback ? "confirming" : isFailCallback ? "fail" : "select",
  );
  const [qty, setQty] = useState<number>(QTY_PRESETS[0] ?? 10);
  const [pendingPay, setPendingPay] = useState<PendingPay | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgetRef = useRef<TossWidgetHandle | null>(null);

  const amount = unitPrice != null ? qty * unitPrice : null;

  // ── confirm(멱등 재호출 안전) ─────────────────────────────────────────────
  const runConfirm = useCallback(async () => {
    if (!cbPaymentKey || !cbPurchaseId || !cbOrderId || !cbAmount) return;
    setPhase("confirming");
    setError(null);
    const res = await invokeEdgeFunction<CouponPurchaseConfirmOutput>("coupon-purchase-confirm", {
      purchaseId: cbPurchaseId,
      paymentKey: cbPaymentKey,
      pgOrderId: cbOrderId,
      amount: Number(cbAmount),
    });
    if (res.ok) {
      setBalance(res.data.balance);
      setPhase("success");
    } else {
      setError(res.message);
      setPhase("fail");
    }
  }, [cbPaymentKey, cbPurchaseId, cbOrderId, cbAmount]);

  useEffect(() => {
    if (isConfirmCallback) void runConfirm();
    // successUrl 진입 시 1회 자동 확정. runConfirm은 콜백 파라미터에만 의존.
  }, [isConfirmCallback, runConfirm]);

  // ── 결제위젯 렌더(phase=widget에서 #payment-method/#agreement 마운트 후) ─────
  useEffect(() => {
    if (phase !== "widget" || !pendingPay || widgetRef.current) return;
    if (!clientKey) {
      setError("결제 연동 준비 중이에요. 쿠폰 충전은 고객센터로 요청해 주세요.");
      setPhase("select");
      return;
    }
    let active = true;
    (async () => {
      try {
        const handle = await loadWidget(clientKey);
        if (!active) return;
        await handle.setAmount(pendingPay.amount);
        await handle.renderPaymentMethods("#payment-method");
        await handle.renderAgreement("#agreement");
        if (!active) return;
        widgetRef.current = handle;
        setWidgetReady(true);
      } catch {
        if (!active) return;
        setError("결제 위젯을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("select");
      }
    })();
    return () => {
      active = false;
    };
  }, [phase, pendingPay, clientKey, loadWidget]);

  async function beginPayment(pay: PendingPay) {
    widgetRef.current = null;
    setWidgetReady(false);
    setError(null);
    setPendingPay(pay);
    setPhase("widget");
  }

  async function handlePay() {
    setError(null);
    const res = await invokeEdgeFunction<CouponPurchaseIntentOutput>("coupon-purchase-intent", {
      qty,
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    // 코엠(F14): 서버가 만든 결제창 파라미터를 그대로 제출 — 승인·확정은 서버 콜백이 담당.
    if (res.data.koem) {
      submitPayForm(res.data.koem.payUrl, res.data.koem.params);
      return;
    }
    if (pgProvider === "koem") {
      // 클라이언트는 koem인데 서버가 결제창 파라미터를 안 줌 — 서버 PG_PROVIDER/시크릿 미설정.
      setError("결제 연동 준비 중이에요. 쿠폰 충전은 고객센터로 요청해 주세요.");
      return;
    }
    await beginPayment({
      purchaseId: res.data.purchaseId,
      pgOrderId: res.data.pgOrderId,
      amount: res.data.amount,
      qty,
    });
  }

  function handleRetryPending(p: PendingPurchase) {
    if (pgProvider === "koem") {
      // 코엠은 서버 콜백이 확정하므로 재시도 대신 반영 여부만 재조회(07 F14).
      void refetchPending();
      return;
    }
    void beginPayment({ purchaseId: p.id, pgOrderId: p.pgOrderId, amount: p.amount, qty: p.qty });
  }

  async function handleRequestPayment() {
    const handle = widgetRef.current;
    if (!handle || !pendingPay) return;
    const origin = window.location.origin;
    try {
      await handle.requestPayment({
        orderId: pendingPay.pgOrderId,
        orderName: `수거쿠폰 ${pendingPay.qty}장`,
        // Toss가 이 URL에 paymentKey/orderId/amount를 덧붙여 리다이렉트 → confirm 콜백.
        successUrl: `${origin}/coupons/purchase?purchaseId=${pendingPay.purchaseId}`,
        failUrl: `${origin}/coupons/purchase?fail=1`,
      });
    } catch {
      setError("결제가 취소되었어요.");
    }
  }

  // ═══════════════════ 렌더 ═══════════════════
  if (phase === "confirming") {
    return (
      <Screen>
        <p data-testid="purchase-confirming" style={{ textAlign: "center", color: gray[600] }}>
          결제를 확인하고 있어요...
        </p>
      </Screen>
    );
  }

  if (phase === "success") {
    return (
      <Screen>
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
            padding: "32px 20px",
            borderRadius: radius.hero,
            backgroundColor: colors.primary.light,
            border: `1px solid ${surface.border}`,
            boxShadow: elevation.card,
          }}
        >
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>
            쿠폰 충전 완료
          </p>
          <p
            data-testid="purchase-success-balance"
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 40, fontWeight: 800, color: colors.primary.DEFAULT }}
          >
            {balance ?? 0}장
          </p>
          <p style={{ margin: 0, fontSize: 13, color: gray[600] }}>현재 보유 수거쿠폰</p>
        </section>
        <BigButton data-testid="purchase-success-done" onClick={() => navigate("/", { replace: true })}>
          완료
        </BigButton>
      </Screen>
    );
  }

  if (phase === "fail") {
    return (
      <Screen>
        <EmptyState
          title="결제를 완료하지 못했어요"
          description={error ?? "결제가 취소되었거나 승인에 실패했어요."}
        />
        {isConfirmCallback ? (
          <BigButton data-testid="purchase-confirm-retry" onClick={() => void runConfirm()}>
            결제 확인 재시도
          </BigButton>
        ) : (
          <BigButton
            data-testid="purchase-fail-back"
            onClick={() => navigate("/coupons/purchase", { replace: true })}
          >
            다시 시도
          </BigButton>
        )}
      </Screen>
    );
  }

  if (phase === "widget") {
    return (
      <Screen>
        <Header title="쿠폰 결제" onBack={() => setPhase("select")} />
        <section
          data-testid="purchase-widget-amount"
          style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}
        >
          <p style={{ margin: 0, fontSize: 13, color: gray[600] }}>결제 금액</p>
          <p
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 28, fontWeight: 800, color: gray[900] }}
          >
            {formatKrw(pendingPay?.amount ?? 0)}
          </p>
        </section>
        {/* 토스 결제위젯 마운트 지점(실 렌더는 키 발급 후). */}
        <div id="payment-method" data-testid="toss-payment-method" />
        <div id="agreement" data-testid="toss-agreement" />
        <BigButton
          data-testid="widget-request-button"
          disabled={!widgetReady}
          onClick={handleRequestPayment}
        >
          {formatKrw(pendingPay?.amount ?? 0)} 결제하기
        </BigButton>
      </Screen>
    );
  }

  // phase === "select"
  // PG 미연동 게이트: 토스 모드에서 클라이언트 키 미발급이면 구매 폼 대신 수동 충전 안내
  // (입금 → admin coupon-adjust). 코엠 모드는 클라이언트 키가 필요 없어 게이트를 타지 않는다(F14).
  if (pgProvider === "toss" && !clientKey) {
    return (
      <Screen>
        <Header title="쿠폰 충전" onBack={() => navigate(-1)} />
        <section
          data-testid="purchase-manual-notice"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 20,
            borderRadius: radius.card,
            backgroundColor: colors.primary.light,
            border: `1px solid ${surface.border}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>
            앱 결제 연동을 준비 중이에요
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: gray[600] }}>
            지금은 고객센터로 충전을 요청해 주세요. 입금 확인 후 관리자가 쿠폰을 충전해 드려요.
          </p>
        </section>
        <BigButton
          data-testid="purchase-manual-support"
          onClick={() => navigate("/support?category=COUPON_PAYMENT")}
        >
          고객센터로 충전 요청하기
        </BigButton>
      </Screen>
    );
  }

  const payDisabled = unitPrice == null || amount == null || qty < QTY_MIN || qty > QTY_MAX;

  return (
    <Screen>
      <Header title="쿠폰 충전" onBack={() => navigate(-1)} />

      {/* 수량 프리셋 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: gray[600] }}>충전 수량</p>
        <div style={{ display: "flex", gap: 8 }}>
          {QTY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`qty-preset-${preset}`}
              aria-pressed={qty === preset}
              onClick={() => setQty(preset)}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.button,
                border: `1.5px solid ${qty === preset ? colors.primary.DEFAULT : surface.border}`,
                backgroundColor: qty === preset ? colors.primary.light : "#fff",
                color: qty === preset ? colors.primary.dark : gray[900],
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {preset}장
            </button>
          ))}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: gray[600] }}>직접 입력 (1~200장)</span>
          <input
            data-testid="qty-custom-input"
            type="number"
            inputMode="numeric"
            min={QTY_MIN}
            max={QTY_MAX}
            value={qty}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              setQty(Math.min(QTY_MAX, Math.max(QTY_MIN, Math.trunc(n))));
            }}
            style={{
              height: 48,
              borderRadius: radius.button,
              border: `1px solid ${surface.border}`,
              padding: "0 14px",
              fontSize: 16,
            }}
          />
        </label>
      </section>

      {/* 예상 금액 */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          borderRadius: radius.card,
          backgroundColor: surface.card,
          border: `1px solid ${surface.border}`,
          boxShadow: elevation.card,
        }}
      >
        <span style={{ fontSize: 14, color: gray[600] }}>
          결제 금액{unitPrice != null ? ` (장당 ${formatKrw(unitPrice)})` : ""}
        </span>
        <span
          data-testid="purchase-amount"
          className="oilpick-tabular-nums"
          style={{ fontSize: 20, fontWeight: 800, color: gray[900] }}
        >
          {amount != null ? formatKrw(amount) : "단가 미설정"}
        </span>
      </section>

      {error && (
        <p data-testid="purchase-error" style={{ margin: 0, fontSize: 13, color: colors.status.danger }}>
          {error}
        </p>
      )}

      <BigButton data-testid="purchase-pay-button" disabled={payDisabled} onClick={handlePay}>
        결제하기
      </BigButton>

      {/* PENDING 대사(07 §1-4 ⓐ) */}
      {pending && pending.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: gray[600] }}>
            결제 확인이 필요한 건
          </p>
          {pending.map((p) => (
            <div
              key={p.id}
              data-testid="pending-purchase-item"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: radius.card,
                backgroundColor: colors.accent.light,
                border: `1px solid ${surface.border}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: gray[900] }}>
                  수거쿠폰 {p.qty}장
                </span>
                <span className="oilpick-tabular-nums" style={{ fontSize: 12, color: gray[600] }}>
                  {formatKrw(p.amount)} · 결제 대기
                </span>
              </div>
              <button
                type="button"
                data-testid="pending-retry-button"
                onClick={() => handleRetryPending(p)}
                style={{
                  minHeight: 40,
                  padding: "0 14px",
                  borderRadius: radius.button,
                  border: `1.5px solid ${colors.primary.DEFAULT}`,
                  backgroundColor: "#fff",
                  color: colors.primary.DEFAULT,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {pgProvider === "koem" ? "결제 상태 새로고침" : "결제 확인 재시도"}
              </button>
            </div>
          ))}
        </section>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: 20,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {children}
    </main>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        data-testid="purchase-back"
        aria-label="뒤로가기"
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          fontSize: 20,
          cursor: "pointer",
          padding: 0,
          color: gray[900],
          lineHeight: 1,
        }}
      >
        &lt;
      </button>
      <h1
        style={{
          fontSize: 16,
          margin: 0,
          flex: 1,
          fontWeight: 700,
          textAlign: "center",
          color: gray[900],
        }}
      >
        {title}
      </h1>
      <span aria-hidden style={{ width: 20 }} />
    </div>
  );
}

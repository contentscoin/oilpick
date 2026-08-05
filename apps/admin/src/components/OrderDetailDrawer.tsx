import { useState } from "react";
import { ORDER_STATUS_LABEL, formatKg, formatKrw, formatPoint, formatRelativeTime, type OrderFault } from "@oilpick/core";
import type { AdminOrderDetail, AdminOrderEvent } from "../hooks/useOrdersAdmin";
import { useEscapeClose, useInitialFocus } from "../hooks/useEscapeClose";
import { invokeEdgeFunction } from "../lib/edgeFunction";

interface OrderDetailDrawerProps {
  order: AdminOrderDetail | null;
  events: AdminOrderEvent[];
  isLoading: boolean;
  onClose: () => void;
  onMutated: () => void;
}

/** 귀책(fault) 선택지 — D4·D6. SUPPLIER/SYSTEM은 쿠폰 자동 환급, RIDER는 소진 유지. */
const FAULT_OPTIONS: Array<{ value: OrderFault; label: string; description: string; refunds: boolean }> = [
  {
    value: "SUPPLIER",
    label: "점주 귀책",
    description: "노쇼·현장 거래 거부 등 점주 사유",
    refunds: true,
  },
  {
    value: "RIDER",
    label: "라이더 귀책",
    description: "미방문·수거 불이행 등 라이더 사유",
    refunds: false,
  },
  {
    value: "SYSTEM",
    label: "플랫폼 귀책",
    description: "시세 오등록·매칭 오류 등 플랫폼 사유",
    refunds: true,
  },
];

/** admin 취소(+fault)가 가능한 상태 — 07 §1-3 {ACCEPTED|ARRIVED|DISPUTED}→CANCELLED. */
const ADMIN_CANCELLABLE = new Set(["ACCEPTED", "ARRIVED", "DISPUTED"]);

/**
 * 03-frontend.md apps/admin "/orders" + 07 F10-⑤ 개정: 상세 드로어에 coupon_cost·환급 여부·
 * cash_paid_amount 표시. admin 취소는 귀책(fault) 선택 필수(D4 — 환급 결과 예고 포함,
 * {ACCEPTED|ARRIVED|DISPUTED}). FORCE_COMPLETE(D6)는 계량 제출된 ARRIVED 한정 + 사유 필수.
 * RESOLVE_DISPUTE는 "중재 후 ARRIVED 복귀·점주 확인 필요" 카피로 교정(07 §1-3 재정의).
 * 모든 전이는 order-transition Edge Function만 경유(절대 규칙 2).
 */
export function OrderDetailDrawer({ order, events, isLoading, onClose, onMutated }: OrderDetailDrawerProps) {
  const [finalKg, setFinalKg] = useState("");
  // [14 J4] 구매 동반 주문만 노출. 빈 문자열 = 정정 안 함(기존 delivered_cans 유지).
  const [finalCans, setFinalCans] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [fault, setFault] = useState<OrderFault | null>(null);
  const [forceMemo, setForceMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLDivElement>();

  async function handleResolveDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    const kg = Number(finalKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      setError("확정 kg을 올바르게 입력해주세요.");
      return;
    }
    // finalCans는 입력했을 때만 실어 보낸다 — 빈 값으로 0을 보내면 배달 통수가 지워진다.
    let cans: number | undefined;
    if (finalCans.trim() !== "") {
      const parsed = Number(finalCans);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 50) {
        setError("확정 통수는 0~50 사이 정수로 입력해주세요.");
        return;
      }
      cans = parsed;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: order.id,
      action: "RESOLVE_DISPUTE",
      payload: cans === undefined ? { finalKg: kg } : { finalKg: kg, finalCans: cans },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(
      "중재 완료 — 무게가 확정되고 주문이 현장 도착(ARRIVED)으로 복귀했어요. 점주가 현금 수령을 확인해야 완료돼요.",
    );
    setFinalKg("");
    onMutated();
  }

  async function handleCancel() {
    if (!order) return;
    if (!fault) {
      setError("귀책 대상을 선택해주세요(취소 필수 항목).");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: order.id,
      action: "CANCEL",
      payload: { reason: cancelReason || "관리자 취소", fault },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("주문이 취소되었어요.");
    onMutated();
  }

  async function handleForceComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    const memo = forceMemo.trim();
    if (!memo) {
      setError("강제 완결 사유를 입력해주세요(필수).");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: order.id,
      action: "FORCE_COMPLETE",
      payload: { memo },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("관리자 확인으로 주문이 완료 처리되었어요.");
    setForceMemo("");
    onMutated();
  }

  // FORCE_COMPLETE(D6): 계량 제출(또는 중재 확정) kg이 있는 ARRIVED에서만 노출.
  const canForceComplete =
    order?.status === "ARRIVED" && (order.measuredKg !== null || order.finalKg !== null);

  const selectedFault = FAULT_OPTIONS.find((f) => f.value === fault);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose} data-testid="order-drawer-backdrop">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="주문 상세"
        className="h-full w-full max-w-lg overflow-y-auto bg-surface-app p-6 shadow-raised"
        onClick={(e) => e.stopPropagation()}
        data-testid="order-drawer"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">주문 상세</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700" data-testid="order-drawer-close">
            닫기
          </button>
        </div>

        {isLoading || !order ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <section className="rounded-card bg-white p-4 shadow-card">
              <p className="text-xs font-medium text-gray-500">상태</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{ORDER_STATUS_LABEL[order.status]}</p>
            </section>

            <section className="grid grid-cols-1 gap-3 rounded-card bg-white p-4 text-sm shadow-card sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">공급업체</p>
                <p className="font-medium text-gray-800">{order.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">라이더</p>
                <p className="font-medium text-gray-800">{order.riderName ?? "미배정"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">예상 kg</p>
                <p className="font-medium tabular-nums text-gray-800">{formatKg(order.requestedKg)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">계량 kg</p>
                <p className="font-medium tabular-nums text-gray-800">
                  {order.measuredKg !== null ? formatKg(order.measuredKg) : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">확정 kg</p>
                <p className="font-medium tabular-nums text-gray-800">
                  {order.finalKg !== null ? formatKg(order.finalKg) : "-"}
                </p>
              </div>
              {/* 08 G7-③: 지급수단 뱃지 + 확정 지급액(POINT면 P 표기). 쿠폰 필드는 레거시 주문에서만. */}
              <div>
                <p className="text-xs text-gray-500">지급수단</p>
                <p className="font-medium text-gray-800" data-testid="order-payout-method">
                  {order.payoutMethod === "POINT" ? (
                    <span className="rounded-pill bg-accent-light px-2 py-0.5 text-xs font-semibold text-accent-deep">
                      🪙 포인트
                    </span>
                  ) : order.payoutMethod === "CASH" ? (
                    <span className="rounded-pill bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">
                      💵 현금
                    </span>
                  ) : (
                    "- (계량 전)"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">확정 지급액</p>
                <p className="font-bold tabular-nums text-accent-deep" data-testid="order-cash-paid">
                  {order.cashPaidAmount !== null
                    ? order.payoutMethod === "POINT"
                      ? formatPoint(order.cashPaidAmount)
                      : formatKrw(order.cashPaidAmount)
                    : "-"}
                </p>
              </div>
              {order.couponCost !== null && (
                <div>
                  <p className="text-xs text-gray-500">소진 쿠폰(레거시)</p>
                  <p className="font-medium tabular-nums text-gray-800" data-testid="order-coupon-cost">
                    {order.couponCost}장
                    {order.refunded && (
                      <span className="ml-1 rounded-pill bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary" data-testid="order-coupon-refunded">
                        환급됨
                      </span>
                    )}
                  </p>
                </div>
              )}
              <div className="border-t border-gray-50 pt-3 sm:col-span-2">
                <p className="text-xs text-gray-500">수거 주소</p>
                <p className="text-sm text-gray-700">{order.pickupAddress}</p>
              </div>
            </section>

            {order.disputeReason && (
              <section className="rounded-card bg-accent-light p-4 shadow-card">
                <p className="text-xs font-medium text-accent-deep">이의신청 사유</p>
                <p className="text-sm text-gray-800">{order.disputeReason}</p>
              </section>
            )}
            {order.cancelReason && (
              <section className="rounded-card bg-white p-4 shadow-card">
                <p className="text-xs font-medium text-gray-500">취소 사유</p>
                <p className="text-sm text-gray-800">{order.cancelReason}</p>
              </section>
            )}

            {order.photoUrls.length > 0 && (
              <section className="rounded-card bg-white p-4 shadow-card">
                <p className="mb-2 text-xs font-medium text-gray-500">계량 사진</p>
                <div className="flex flex-wrap gap-2">
                  {order.photoUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={url}
                        alt="계량 사진"
                        className="h-24 w-24 rounded-button border border-gray-100 object-cover transition-shadow hover:shadow-card"
                      />
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-card bg-white p-4 shadow-card">
              <p className="mb-3 text-xs font-medium text-gray-500">이벤트 타임라인</p>
              <ol className="flex flex-col" data-testid="order-event-timeline">
                {events.map((ev, i) => (
                  <li key={ev.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    {/* 도트 컬럼은 self-stretch로 행 높이를 유지해 연결선(flex-1)이 끊기지 않게 한다. */}
                    <div className="flex flex-col items-center self-stretch">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-pill bg-primary" />
                      {i < events.length - 1 && <span className="w-px flex-1 bg-gray-200" />}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">
                        {ev.fromStatus ? ORDER_STATUS_LABEL[ev.fromStatus as keyof typeof ORDER_STATUS_LABEL] : "생성"} →{" "}
                        {ORDER_STATUS_LABEL[ev.toStatus as keyof typeof ORDER_STATUS_LABEL]}
                      </p>
                      <p className="text-xs text-gray-500">
                        {ev.actorId ? `actor: ${ev.actorId.slice(0, 8)}` : "시스템"} · {formatRelativeTime(ev.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
            {message && <p className="text-sm font-medium text-primary">{message}</p>}

            {order.status === "DISPUTED" && (
              <form onSubmit={handleResolveDispute} className="rounded-card bg-white p-4 shadow-card">
                <p className="mb-1 text-sm font-semibold text-gray-800">분쟁 중재</p>
                <p className="mb-2 text-xs text-gray-500">
                  중재는 무게 확정까지만이에요 — 확정 후 주문은 현장 도착(ARRIVED)으로 복귀하고, 점주가 현금 수령을
                  확인해야 완료돼요.
                </p>
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs text-gray-500">확정 kg</span>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={finalKg}
                    onChange={(e) => setFinalKg(e.target.value)}
                    className="w-full rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                    data-testid="resolve-dispute-final-kg"
                  />
                </label>
                {/* [14 J4] 구매 동반 주문만 — 중재 후에는 라이더 재제출이 막히므로 배달 통수를
                    고칠 수 있는 유일한 지점이다. 비워 두면 기존 배달 통수를 유지한다. */}
                {(order.orderKind === "PURCHASE" || order.orderKind === "MIXED") && (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs text-gray-500">
                      확정 통수 (선택 — 비우면 현재 {order.deliveredCans ?? 0}통 유지)
                    </span>
                    <input
                      type="number"
                      step="1"
                      min={0}
                      max={50}
                      value={finalCans}
                      onChange={(e) => setFinalCans(e.target.value)}
                      className="w-full rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                      data-testid="resolve-dispute-final-cans"
                    />
                  </label>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 w-full rounded-button bg-primary text-sm font-semibold text-white shadow-card disabled:opacity-60"
                  data-testid="resolve-dispute-submit"
                >
                  중재 확정 (ARRIVED 복귀)
                </button>
              </form>
            )}

            {canForceComplete && (
              <form onSubmit={handleForceComplete} className="rounded-card border border-accent/30 bg-white p-4 shadow-card">
                <p className="mb-1 text-sm font-semibold text-accent-deep">강제 완결 (FORCE_COMPLETE)</p>
                <p className="mb-2 text-xs text-gray-500">
                  점주가 수령 확인을 거부·방치하는 교착을 해소해요. 제출/중재된 무게 기준으로 현금 지급액이 기록되고
                  즉시 완료 처리돼요. 사유는 필수예요.
                </p>
                <input
                  type="text"
                  placeholder="사유(필수)"
                  value={forceMemo}
                  onChange={(e) => setForceMemo(e.target.value)}
                  className="mb-3 w-full rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                  data-testid="force-complete-memo"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 w-full rounded-button bg-accent text-sm font-semibold text-white shadow-card disabled:opacity-60"
                  data-testid="force-complete-button"
                >
                  강제 완결
                </button>
              </form>
            )}

            {ADMIN_CANCELLABLE.has(order.status) && (
              <div className="rounded-card border border-status-danger/20 bg-white p-4 shadow-card">
                <p className="mb-1 text-sm font-semibold text-status-danger">주문 취소 (귀책 선택 필수)</p>
                <p className="mb-3 text-xs text-gray-500">
                  귀책은 감사 기록으로 남아요(08 P1). 레거시 쿠폰 주문(coupon_cost 있음)은 점주/플랫폼
                  귀책일 때 쿠폰이 자동 환급돼요.
                </p>
                <div className="mb-3 flex flex-col gap-2" role="radiogroup" aria-label="귀책 대상">
                  {FAULT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-button border px-3 py-2 ${
                        fault === option.value ? "border-status-danger bg-status-danger/5" : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="fault"
                        value={option.value}
                        checked={fault === option.value}
                        onChange={() => setFault(option.value)}
                        className="mt-0.5"
                        data-testid={`fault-option-${option.value}`}
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-800">{option.label}</span>
                        <span className="block text-xs text-gray-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {selectedFault && (
                  <p
                    className={`mb-3 rounded-button px-3 py-2 text-xs font-medium ${
                      selectedFault.refunds ? "bg-primary-light text-primary" : "bg-gray-100 text-gray-600"
                    }`}
                    data-testid="fault-refund-preview"
                  >
                    {selectedFault.refunds
                      ? order.couponCost !== null
                        ? `점주/플랫폼 귀책 → 라이더에게 쿠폰 ${order.couponCost}장 자동 환급(레거시 주문)`
                        : "점주/플랫폼 귀책 — 감사 기록으로 남아요(환급 대상 없음)"
                      : order.couponCost !== null
                        ? "라이더 귀책 → 쿠폰 환급 없음(소진 유지)"
                        : "라이더 귀책 — 감사 기록으로 남아요"}
                  </p>
                )}
                <input
                  type="text"
                  placeholder="취소 사유(선택)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mb-3 w-full rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-status-danger"
                  data-testid="cancel-reason-input"
                />
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy || !fault}
                  className="h-10 w-full rounded-button bg-status-danger text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="cancel-order-button"
                >
                  주문 취소
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { formatKrw, formatRelativeTime } from "@oilpick/core";
import {
  useRiderCouponLedger,
  useRiderCouponPurchases,
  type RiderCouponPurchaseRow,
} from "../hooks/useUsersAdmin";
import { useEscapeClose, useInitialFocus } from "../hooks/useEscapeClose";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { COUPON_ENTRY_LABEL } from "../lib/couponSales";
import type { CouponAdjustOutput, CouponRefundOutput } from "@oilpick/core";

/**
 * [17 Q4] 라이더탭 쿠폰 운영 패널 — 07 F10-② 원형(a4b4fdd^) 복원 + 구매 환불 추가:
 *  - 쿠폰 잔액(v_coupon_balance — 잔액은 뷰로만, 17 C4) + 충전/조정 이력(coupon_ledger)
 *  - [쿠폰 조정](coupon-adjust — qty ±, 사유 필수. 음수 조정이 잔액을 초과하면 INSUFFICIENT_COUPON 409)
 *  - [구매 환불](coupon-refund — PAID 구매 건 선택 + 수량(비우면 전액) + 사유 필수, 건당 1회)
 * 조정·환불 모두 실행 전 확인 다이얼로그를 거친다(파괴적 액션 오탭 방지 — 16 L9 관례).
 * 원장 insert는 Edge Function(fn_charge_coupon/fn_refund_purchase)만 경유한다(절대 규칙 1).
 */

export function RiderCouponPanel({
  riderId,
  riderName,
  balance,
  onChanged,
}: {
  riderId: string;
  /** 확인 다이얼로그 대상 표기용(없으면 id 앞 8자). */
  riderName?: string;
  balance: number | undefined;
  onChanged: () => void;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const { data: ledger, isLoading: ledgerLoading } = useRiderCouponLedger(riderId, ledgerOpen);
  const displayName = riderName ?? riderId.slice(0, 8);

  return (
    <div className="mt-3 border-t border-gray-50 pt-3" data-testid={`rider-coupon-panel-${riderId}`}>
      {/* [03 레이아웃 강건성] 잔액+버튼 행은 flex-wrap — 확대 시 버튼 줄이 자연스럽게 내려간다. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">쿠폰 잔액</span>
        <span
          className="rounded-pill bg-accent-light px-3 py-1 text-sm font-bold tabular-nums text-accent-deep"
          data-testid={`coupon-balance-${riderId}`}
        >
          {balance !== undefined ? `${balance.toLocaleString("ko-KR")}장` : "-"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLedgerOpen((v) => !v)}
            className="min-h-8 rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid={`coupon-ledger-toggle-${riderId}`}
          >
            {ledgerOpen ? "이력 닫기" : "충전/조정 이력"}
          </button>
          <button
            type="button"
            onClick={() => setRefundOpen(true)}
            className="min-h-8 rounded-button border border-status-danger px-3 py-1.5 text-xs font-semibold text-status-danger hover:bg-status-danger/5"
            data-testid={`coupon-refund-open-${riderId}`}
          >
            구매 환불
          </button>
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className="min-h-8 rounded-button bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-card"
            data-testid={`coupon-adjust-open-${riderId}`}
          >
            쿠폰 조정
          </button>
        </div>
      </div>

      {ledgerOpen && (
        <div className="mt-3 overflow-x-auto" data-testid={`coupon-ledger-${riderId}`}>
          {ledgerLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : ledger && ledger.length > 0 ? (
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-1.5 font-medium">일시</th>
                  <th className="py-1.5 font-medium">유형</th>
                  <th className="py-1.5 font-medium">수량</th>
                  <th className="py-1.5 font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-500">{formatRelativeTime(row.createdAt)}</td>
                    <td className="py-1.5 text-gray-700">{COUPON_ENTRY_LABEL[row.entryType] ?? row.entryType}</td>
                    <td className={`py-1.5 font-medium tabular-nums ${row.qty >= 0 ? "text-primary" : "text-status-danger"}`}>
                      {row.qty >= 0 ? "+" : ""}
                      {row.qty}장
                    </td>
                    <td className="py-1.5 text-gray-500">{row.memo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">쿠폰 이력이 없어요.</p>
          )}
        </div>
      )}

      {adjustOpen && (
        <CouponAdjustModal
          riderId={riderId}
          riderName={displayName}
          balance={balance}
          onClose={() => setAdjustOpen(false)}
          onDone={() => {
            setAdjustOpen(false);
            onChanged();
          }}
        />
      )}

      {refundOpen && (
        <CouponRefundModal
          riderId={riderId}
          riderName={displayName}
          onClose={() => setRefundOpen(false)}
          onDone={() => {
            setRefundOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** 쿠폰 조정 모달 — 입력 → 확인 다이얼로그(대상·수량·사유 재확인) → coupon-adjust 실행. */
function CouponAdjustModal({
  riderId,
  riderName,
  balance,
  onClose,
  onDone,
}: {
  riderId: string;
  riderName: string;
  balance: number | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("");
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLFormElement>();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum === 0) {
      setError("조정 수량은 0이 아닌 정수로 입력해주세요(차감은 음수).");
      return;
    }
    if (!memo.trim()) {
      setError("조정 사유(메모)를 입력해주세요.");
      return;
    }
    // 원장은 append-only(되돌리기 없음) — 실행 전 확인 다이얼로그를 강제한다.
    setConfirming(true);
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await invokeEdgeFunction<CouponAdjustOutput>("coupon-adjust", {
      riderId,
      qty: Number(qty),
      memo: memo.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      // 음수 조정 초과 시 서버(fn_charge_coupon)가 INSUFFICIENT_COUPON을 raise → 409.
      setConfirming(false);
      setError(result.message);
      return;
    }
    onDone();
  }

  const qtyNum = Number(qty);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      data-testid="coupon-adjust-backdrop"
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="쿠폰 조정"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-card bg-white p-6 shadow-raised"
        data-testid="coupon-adjust-modal"
      >
        {confirming ? (
          <div data-testid="coupon-adjust-confirm-dialog">
            <h3 className="mb-1 text-lg font-bold text-gray-900">조정을 실행할까요?</h3>
            <p className="mb-4 text-sm text-gray-600">
              <span className="font-semibold">{riderName}</span> 라이더의 쿠폰을{" "}
              <span className={`font-semibold tabular-nums ${qtyNum >= 0 ? "text-primary" : "text-status-danger"}`}>
                {qtyNum >= 0 ? "+" : ""}
                {qtyNum}장
              </span>{" "}
              조정해요. 사유: {memo.trim()}
            </p>
            <p className="mb-4 text-xs text-gray-500">원장(ADJUST)에 기록되고 되돌릴 수 없어요(append-only).</p>
            {error && (
              <p className="mb-3 text-sm font-medium text-status-danger" data-testid="coupon-adjust-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                data-testid="coupon-adjust-back"
              >
                돌아가기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm()}
                className="min-h-11 flex-1 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60"
                data-testid="coupon-adjust-confirm"
              >
                {busy ? "처리 중..." : "조정 확정"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="mb-1 text-lg font-bold text-gray-900">쿠폰 조정</h3>
            <p className="mb-4 text-xs text-gray-500">
              현재 잔액 {balance !== undefined ? `${balance}장` : "-"} · 차감은 음수로 입력해요. 잔액보다 큰 차감은
              거부돼요.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">조정 수량(장, ±)</span>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-accent"
                data-testid="coupon-adjust-qty"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">사유(필수)</span>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 데모 라이더 선지급"
                className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-accent"
                data-testid="coupon-adjust-memo"
              />
            </label>
            {error && (
              <p className="mb-3 text-sm font-medium text-status-danger" data-testid="coupon-adjust-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                data-testid="coupon-adjust-cancel"
              >
                취소
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white shadow-card"
                data-testid="coupon-adjust-submit"
              >
                조정하기
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/**
 * 구매 환불 모달 — PAID 구매 목록에서 선택 + 수량(비우면 전액) + 사유 → 확인 다이얼로그 →
 * coupon-refund 실행(건당 1회 — 부분 환불도 1회로 소진, 금액은 그 건의 스냅샷 단가 기준).
 */
function CouponRefundModal({
  riderId,
  riderName,
  onClose,
  onDone,
}: {
  riderId: string;
  riderName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: purchases, isLoading } = useRiderCouponPurchases(riderId, true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLFormElement>();

  const selected = (purchases ?? []).find((p) => p.id === selectedId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("환불할 구매 건을 선택해주세요.");
      return;
    }
    if (qty !== "") {
      const qtyNum = Number(qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > selected.qty) {
        setError(`환불 수량은 1~${selected.qty}장 사이의 정수로 입력해주세요(비우면 전액).`);
        return;
      }
    }
    if (!reason.trim()) {
      setError("환불 사유를 입력해주세요.");
      return;
    }
    // PG 취소 + 원장 차감은 되돌릴 수 없다 — 실행 전 확인 다이얼로그를 강제한다.
    setConfirming(true);
  }

  async function handleConfirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const qtyNum = qty === "" ? undefined : Number(qty);
    const result = await invokeEdgeFunction<CouponRefundOutput>("coupon-refund", {
      purchaseId: selected.id,
      ...(qtyNum !== undefined ? { qty: qtyNum } : {}),
      reason: reason.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      // 미사용 잔액 부족 409 INSUFFICIENT_COUPON / PG 취소 실패 402 PAYMENT_FAILED 등.
      setConfirming(false);
      setError(result.message);
      return;
    }
    setConfirming(false);
    setSuccess(`쿠폰 ${result.data.refundedQty}장이 환불되었어요. (잔액 ${result.data.balance}장)`);
  }

  const refundQtyLabel = selected ? (qty === "" ? `전액 ${selected.qty}장` : `${qty}장`) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      data-testid="coupon-refund-backdrop"
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="쿠폰 구매 환불"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-card bg-white p-6 shadow-raised"
        data-testid="coupon-refund-modal"
      >
        {success ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-gray-900">환불 완료</h3>
            <p className="text-sm font-medium text-primary" data-testid="coupon-refund-success">
              {success}
            </p>
            <button
              type="button"
              onClick={onDone}
              className="min-h-11 rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white"
              data-testid="coupon-refund-close"
            >
              닫기
            </button>
          </div>
        ) : confirming && selected ? (
          <div data-testid="coupon-refund-confirm-dialog">
            <h3 className="mb-1 text-lg font-bold text-gray-900">환불을 실행할까요?</h3>
            <p className="mb-4 text-sm text-gray-600">
              <span className="font-semibold">{riderName}</span> 라이더의 구매 건(
              {selected.qty}장 / {formatKrw(selected.amount)})에서{" "}
              <span className="font-semibold text-status-danger">{refundQtyLabel}</span>을 환불해요. 사유:{" "}
              {reason.trim()}
            </p>
            <p className="mb-4 text-xs text-gray-500">
              환불은 구매 건당 1회만 가능해요(부분 환불도 1회로 소진). PG 취소 후 되돌릴 수 없어요.
            </p>
            {error && (
              <p className="mb-3 text-sm font-medium text-status-danger" data-testid="coupon-refund-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                data-testid="coupon-refund-back"
              >
                돌아가기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm()}
                className="min-h-11 flex-1 rounded-button bg-status-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                data-testid="coupon-refund-confirm"
              >
                {busy ? "처리 중..." : "환불 확정"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="mb-1 text-lg font-bold text-gray-900">구매 환불</h3>
            <p className="mb-4 text-xs text-gray-500">
              결제 완료(PAID) 구매 건만 환불할 수 있어요 — 건당 1회, 금액은 그 건의 단가 스냅샷 기준이에요.
            </p>

            {isLoading ? (
              <p className="mb-4 text-sm text-gray-500">불러오는 중...</p>
            ) : purchases && purchases.length > 0 ? (
              <div className="mb-4 flex max-h-56 flex-col gap-2 overflow-y-auto" data-testid="coupon-refund-purchase-list">
                {purchases.map((p) => (
                  <PurchaseOption
                    key={p.id}
                    purchase={p}
                    selected={p.id === selectedId}
                    onSelect={() => {
                      setSelectedId(p.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-gray-500" data-testid="coupon-refund-empty">
                환불 가능한 결제 완료 구매 건이 없어요.
              </p>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">환불 수량(장)</span>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={selected ? `비우면 전액(${selected.qty}장)` : "비우면 전액"}
                className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-primary"
                data-testid="coupon-refund-qty"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">환불 사유(필수)</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 오결제 고객 요청"
                className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-primary"
                data-testid="coupon-refund-reason"
              />
            </label>
            {error && (
              <p className="mb-3 text-sm font-medium text-status-danger" data-testid="coupon-refund-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                data-testid="coupon-refund-cancel"
              >
                취소
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-button bg-status-danger px-3 py-2 text-sm font-semibold text-white"
                data-testid="coupon-refund-submit"
              >
                환불하기
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/** 환불 대상 구매 건 라디오 행 — 수량/금액/단가/PG 주문번호. */
function PurchaseOption({
  purchase,
  selected,
  onSelect,
}: {
  purchase: RiderCouponPurchaseRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-card border px-3 py-2 text-sm transition-colors ${
        selected ? "border-primary bg-primary-light/40" : "border-gray-100 hover:bg-gray-50"
      }`}
      data-testid={`coupon-refund-purchase-${purchase.id}`}
    >
      <input
        type="radio"
        name="coupon-refund-purchase"
        checked={selected}
        onChange={onSelect}
        className="accent-primary"
      />
      <span className="font-semibold tabular-nums text-gray-900">
        {purchase.qty}장 / {formatKrw(purchase.amount)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
        단가 {formatKrw(purchase.unitPrice)} · {purchase.pgOrderId} · {formatRelativeTime(purchase.paidAt ?? purchase.createdAt)}
      </span>
    </label>
  );
}

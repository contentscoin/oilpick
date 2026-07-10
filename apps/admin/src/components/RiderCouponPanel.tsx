import { useState } from "react";
import { formatRelativeTime } from "@oilpick/core";
import { useRiderCouponLedger } from "../hooks/useUsersAdmin";
import { useEscapeClose, useInitialFocus } from "../hooks/useEscapeClose";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { COUPON_ENTRY_LABEL } from "../lib/couponSales";
import type { CouponAdjustOutput } from "@oilpick/core";

/**
 * 07 F10-② 라이더탭 쿠폰 운영 패널: 쿠폰 잔액 표시 + [수동 조정] 모달(coupon-adjust — qty ±,
 * memo 필수, 음수 조정이 잔액을 초과하면 INSUFFICIENT_COUPON 409 안내) + 라이더별 충전/조정
 * 이력(coupon_ledger). 원장 insert는 Edge Function(coupon-adjust→fn_charge_coupon)만 경유하고
 * 잔액은 v_coupon_balance로만 읽는다(07 §1-1 절대 규칙 확장).
 */

export function RiderCouponPanel({
  riderId,
  balance,
  onAdjusted,
}: {
  riderId: string;
  balance: number | undefined;
  onAdjusted: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const { data: ledger, isLoading: ledgerLoading } = useRiderCouponLedger(riderId, ledgerOpen);

  return (
    <div className="mt-3 border-t border-gray-50 pt-3" data-testid={`rider-coupon-panel-${riderId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">쿠폰 잔액</span>
        <span
          className="rounded-pill bg-accent-light px-3 py-1 text-sm font-bold tabular-nums text-accent-deep"
          data-testid={`coupon-balance-${riderId}`}
        >
          {balance !== undefined ? `${balance.toLocaleString("ko-KR")}장` : "-"}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setLedgerOpen((v) => !v)}
            className="h-8 rounded-button border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid={`coupon-ledger-toggle-${riderId}`}
          >
            {ledgerOpen ? "이력 닫기" : "충전/조정 이력"}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="h-8 rounded-button bg-accent px-3 text-xs font-semibold text-white shadow-card"
            data-testid={`coupon-adjust-open-${riderId}`}
          >
            수동 조정
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

      {modalOpen && (
        <CouponAdjustModal
          riderId={riderId}
          balance={balance}
          onClose={() => setModalOpen(false)}
          onAdjusted={() => {
            setModalOpen(false);
            onAdjusted();
          }}
        />
      )}
    </div>
  );
}

function CouponAdjustModal({
  riderId,
  balance,
  onClose,
  onAdjusted,
}: {
  riderId: string;
  balance: number | undefined;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [qty, setQty] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLFormElement>();

  async function handleSubmit(e: React.FormEvent) {
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
    setBusy(true);
    const result = await invokeEdgeFunction<CouponAdjustOutput>("coupon-adjust", {
      riderId,
      qty: qtyNum,
      memo: memo.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      // 음수 조정 초과 시 서버(fn_charge_coupon)가 INSUFFICIENT_COUPON을 raise → 409.
      setError(result.message);
      return;
    }
    onAdjusted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      data-testid="coupon-adjust-backdrop"
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="쿠폰 수동 조정"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-card bg-white p-6 shadow-raised"
        data-testid="coupon-adjust-modal"
      >
        <h3 className="mb-1 text-lg font-bold text-gray-900">쿠폰 수동 조정</h3>
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
            className="h-11 flex-1 rounded-button border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            data-testid="coupon-adjust-cancel"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-11 flex-1 rounded-button bg-accent text-sm font-semibold text-white shadow-card disabled:opacity-60"
            data-testid="coupon-adjust-submit"
          >
            {busy ? "처리 중..." : "조정 실행"}
          </button>
        </div>
      </form>
    </div>
  );
}

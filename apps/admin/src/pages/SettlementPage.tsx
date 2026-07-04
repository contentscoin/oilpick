import { useState } from "react";
import { formatPoint } from "@oilpick/core";
import {
  useAdminLedgerAudit,
  useAdminWithdrawals,
  useDailyLedgerTotals,
} from "../hooks/useSettlementAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { WithdrawProcessOutput } from "@oilpick/core";

const WITHDRAW_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "신청됨",
  APPROVED: "승인됨(이체 대기)",
  REJECTED: "반려됨",
  PAID: "이체 완료",
};

const LEDGER_ENTRY_LABEL: Record<string, string> = {
  EARN: "매각대금",
  HOLD: "수거비 보류",
  RELEASE: "보류 확정",
  WITHDRAW_REQUEST: "출금 신청",
  WITHDRAW_CANCEL: "출금 반려 복구",
  ADJUST: "관리자 조정",
  PURCHASE: "쇼핑몰 결제",
};

/**
 * 03-frontend.md apps/admin "/settlement": "withdrawals 큐(승인/반려/이체완료 처리) +
 * point_ledger 감사 테이블 + 일별 합계".
 */
export function SettlementPage() {
  const [statusFilter, setStatusFilter] = useState("REQUESTED");
  const { data: withdrawals, isLoading, refetch } = useAdminWithdrawals(statusFilter);
  const { data: ledger, isLoading: ledgerLoading } = useAdminLedgerAudit(0);
  const { data: dailyTotals } = useDailyLedgerTotals();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">정산</h1>
        <p className="text-sm text-zinc-500">출금 신청을 처리하고 원장을 감사해요.</p>
      </div>

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">출금 큐</h2>
        <div className="mb-4 flex gap-2">
          {["REQUESTED", "APPROVED", "PAID", "REJECTED", "ALL"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                statusFilter === s ? "bg-primary text-white" : "bg-zinc-100 text-zinc-600"
              }`}
              data-testid={`withdraw-filter-${s}`}
            >
              {s === "ALL" ? "전체" : WITHDRAW_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        ) : withdrawals && withdrawals.length > 0 ? (
          <div className="flex flex-col gap-3" data-testid="withdrawal-list">
            {withdrawals.map((w) => (
              <WithdrawalRow key={w.id} withdrawal={w} onProcessed={refetch} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">해당 상태의 출금 신청이 없어요.</p>
        )}
      </div>

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">일별 합계 (최근 14일)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="daily-totals-table">
            <thead>
              <tr className="border-b border-zinc-100 text-zinc-500">
                <th className="py-2 font-medium">날짜</th>
                <th className="py-2 font-medium">EARN</th>
                <th className="py-2 font-medium">HOLD</th>
                <th className="py-2 font-medium">RELEASE</th>
                <th className="py-2 font-medium">출금 신청</th>
              </tr>
            </thead>
            <tbody>
              {(dailyTotals ?? []).map((row) => (
                <tr key={row.day} className="border-b border-zinc-50">
                  <td className="py-2">{row.day}</td>
                  <td className="py-2 tabular-nums">{formatPoint(row.earn)}</td>
                  <td className="py-2 tabular-nums">{formatPoint(row.hold)}</td>
                  <td className="py-2 tabular-nums">{formatPoint(row.release)}</td>
                  <td className="py-2 tabular-nums">{formatPoint(row.withdraw)}</td>
                </tr>
              ))}
              {(!dailyTotals || dailyTotals.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-400">
                    최근 14일 데이터가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">원장 감사 (최근 100건)</h2>
        {ledgerLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="ledger-audit-table">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">사용자</th>
                  <th className="py-2 font-medium">유형</th>
                  <th className="py-2 font-medium">금액</th>
                  <th className="py-2 font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {(ledger ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-zinc-50">
                    <td className="py-2 text-zinc-500">{new Date(row.createdAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2">{row.userName}</td>
                    <td className="py-2">{LEDGER_ENTRY_LABEL[row.entryType] ?? row.entryType}</td>
                    <td className={`py-2 tabular-nums font-medium ${row.amount >= 0 ? "text-primary" : "text-status-danger"}`}>
                      {row.amount >= 0 ? "+" : ""}
                      {formatPoint(row.amount)}
                    </td>
                    <td className="py-2 text-zinc-500">{row.memo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function WithdrawalRow({
  withdrawal,
  onProcessed,
}: {
  withdrawal: {
    id: string;
    userName: string;
    amount: number;
    status: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    adminMemo: string | null;
  };
  onProcessed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState("");

  async function process(decision: "APPROVED" | "REJECTED" | "PAID") {
    setBusy(true);
    setError(null);
    const result = await invokeEdgeFunction<WithdrawProcessOutput>("withdraw-process", {
      withdrawalId: withdrawal.id,
      decision,
      ...(memo ? { memo } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onProcessed();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-100 p-4" data-testid={`withdrawal-row-${withdrawal.id}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-zinc-900">
            {withdrawal.userName} · <span className="tabular-nums">{formatPoint(withdrawal.amount)}</span>
          </p>
          <p className="text-sm text-zinc-500">
            {withdrawal.bankName} {withdrawal.bankAccount} ({withdrawal.bankHolder})
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
          {WITHDRAW_STATUS_LABEL[withdrawal.status]}
        </span>
      </div>
      {withdrawal.adminMemo && <p className="text-xs text-zinc-400">메모: {withdrawal.adminMemo}</p>}
      {error && <p className="text-sm font-medium text-status-danger">{error}</p>}

      {withdrawal.status === "REQUESTED" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="메모(선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-primary"
            data-testid={`withdrawal-memo-${withdrawal.id}`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => process("APPROVED")}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-60"
            data-testid={`withdrawal-approve-${withdrawal.id}`}
          >
            승인
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => process("REJECTED")}
            className="h-9 rounded-lg bg-status-danger px-3 text-sm font-semibold text-white disabled:opacity-60"
            data-testid={`withdrawal-reject-${withdrawal.id}`}
          >
            반려
          </button>
        </div>
      )}

      {withdrawal.status === "APPROVED" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => process("PAID")}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-60"
            data-testid={`withdrawal-paid-${withdrawal.id}`}
          >
            이체 완료 처리
          </button>
        </div>
      )}
    </div>
  );
}

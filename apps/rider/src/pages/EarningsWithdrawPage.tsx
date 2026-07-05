import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BigButton, PointBalanceCard, Toast, colors, inputClassName, inputStyle, radius, surface } from "@oilpick/ui";
import { MIN_WITHDRAW, formatPoint } from "@oilpick/core";
import type { WithdrawRequestOutput } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { usePointBalance } from "../hooks/useEarnings";
import { useBankAccount, useSaveBankAccount } from "../hooks/useBankAccount";
import { queryKeys } from "../lib/queryClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";

/**
 * R8 출금 신청. apps/user/src/pages/WithdrawPage.tsx와 동일 구조(계좌 등록/표시 + 최소 10,000P
 * 검증 + withdraw-request 호출) — 계좌 컬럼만 rider_profiles(useBankAccount)로 다르다.
 */
export function EarningsWithdrawPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: balance } = usePointBalance(userId);
  const { data: bankAccount, isLoading: bankLoading } = useBankAccount(userId);
  const saveBankAccount = useSaveBankAccount(userId);

  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  const [editingBank, setEditingBank] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<WithdrawRequestOutput | null>(null);

  const showBankDisplay = !bankLoading && Boolean(bankAccount) && !editingBank;
  const showBankForm = !bankLoading && (!bankAccount || editingBank);

  const amount = Number(amountInput);
  const available = balance?.available ?? 0;
  const amountValid = Number.isInteger(amount) && amount >= MIN_WITHDRAW && amount <= available;

  async function handleSaveBank() {
    setError(null);
    if (!bankName.trim() || !bankAccountNo.trim() || !bankHolder.trim()) {
      setError("계좌 정보를 모두 입력해주세요.");
      return;
    }
    try {
      await saveBankAccount({ bankName: bankName.trim(), bankAccount: bankAccountNo.trim(), bankHolder: bankHolder.trim() });
      setEditingBank(false);
    } catch {
      setError("계좌 저장에 실패했어요. 다시 시도해주세요.");
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!amountValid) {
      setError(
        amount > available
          ? "출금 가능 잔액을 초과했어요."
          : `최소 출금 금액은 ${formatPoint(MIN_WITHDRAW)}이에요.`,
      );
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction<WithdrawRequestOutput>("withdraw-request", { amount });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess(result.data);
    if (userId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.balance(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger(userId) });
    }
  }

  if (success) {
    return (
      <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>출금 신청 완료</h1>
        <div
          data-testid="withdraw-success"
          style={{ borderRadius: radius.card, padding: 20, backgroundColor: colors.primary.light }}
        >
          <p style={{ margin: 0, fontSize: 14, color: colors.primary.dark }}>신청 금액</p>
          <p className="oilpick-tabular-nums" style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 700, color: colors.primary.DEFAULT }}>
            {formatPoint(success.amount)}
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 13, color: colors.status.wait }}>
            관리자 승인 후 계좌로 이체돼요. 진행 상황은 정산에서 확인할 수 있어요.
          </p>
        </div>
        <BigButton data-testid="withdraw-done-button" onClick={() => navigate("/earnings")}>
          정산으로 돌아가기
        </BigButton>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>출금 신청</h1>

      <PointBalanceCard available={available} held={balance?.held ?? 0} />

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>출금 계좌</h2>
        {showBankDisplay && bankAccount && (
          <div
            data-testid="bank-account-display"
            style={{ borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}` }}
          >
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{bankAccount.bankName}</p>
            <p style={{ margin: "4px 0 0", fontSize: 14 }}>{bankAccount.bankAccount}</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>예금주 {bankAccount.bankHolder}</p>
            <button
              type="button"
              data-testid="bank-account-edit-button"
              onClick={() => {
                setBankName(bankAccount.bankName);
                setBankAccountNo(bankAccount.bankAccount);
                setBankHolder(bankAccount.bankHolder);
                setEditingBank(true);
              }}
              style={{ marginTop: 12, background: "none", border: "none", color: colors.primary.DEFAULT, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              계좌 정보 수정
            </button>
          </div>
        )}
        {showBankForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              data-testid="bank-name-input"
              placeholder="은행명"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
            <input
              data-testid="bank-account-input"
              placeholder="계좌번호"
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
            <input
              data-testid="bank-holder-input"
              placeholder="예금주"
              value={bankHolder}
              onChange={(e) => setBankHolder(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
            <BigButton data-testid="bank-account-save-button" variant="secondary" onClick={handleSaveBank}>
              계좌 저장
            </BigButton>
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>출금 금액</h2>
        <input
          data-testid="withdraw-amount-input"
          type="number"
          inputMode="numeric"
          placeholder={`최소 ${formatPoint(MIN_WITHDRAW)}`}
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          className={inputClassName}
          style={inputStyle}
        />
        <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
          최소 출금 {formatPoint(MIN_WITHDRAW)} · 출금 가능 잔액 {formatPoint(available)}
        </p>
      </section>

      {error && <Toast message={error} variant="error" />}

      <BigButton
        data-testid="withdraw-submit-button"
        onClick={handleSubmit}
        loading={submitting}
        disabled={!bankAccount || showBankForm}
      >
        출금 신청하기
      </BigButton>
    </main>
  );
}

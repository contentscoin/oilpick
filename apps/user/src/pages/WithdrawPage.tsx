import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  ConfirmSheet,
  PageHeader,
  PointBalanceCard,
  colors,
  inputClassName,
  inputStyle,
  radius,
  surface,
} from "@oilpick/ui";
import { MIN_WITHDRAW, formatPoint, type WithdrawRequestOutput } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { usePointBalance } from "../hooks/useWallet";
import { useBankAccount, useSaveBankAccount } from "../hooks/useBankAccount";
import { queryKeys } from "../lib/queryClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";

/**
 * U12 출금 신청 — 08 G5-②로 부활(07 F8/D1이 제거했던 화면).
 * 계좌 등록/표시(useBankAccount — supplier_profiles.bank_*) + 금액 입력(최소 10,000P·잔액
 * 검증 fail-fast) → withdraw-request Edge Function → 성공 ConfirmSheet → 지갑 복귀.
 * 서버 에러 코드 NO_BANK_ACCOUNT/INSUFFICIENT_BALANCE는 invokeEdgeFunction이
 * ERROR_MESSAGE_KO로 한국어 표면화한다. 원장 차감(WITHDRAW_REQUEST)은 전적으로 서버
 * RPC(fn_request_withdraw)의 일이다(CLAUDE.md 절대 규칙 1).
 */
export function WithdrawPage() {
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

  // 계좌가 등록돼 있고 수정 모드가 아닐 때만 표시용 카드를 보여준다. 그 외(미등록 또는 수정 중)는
  // 입력 폼을 보여준다(계좌 없으면 등록 유도).
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
    // fail-fast: 서버(fn_request_withdraw)가 최종 검증하지만 왕복 전에 클라이언트에서 먼저 거른다.
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
      // NO_BANK_ACCOUNT/INSUFFICIENT_BALANCE 등 서버 에러 코드의 한국어 메시지.
      setError(result.message);
      return;
    }
    setSuccess(result.data);
    if (userId) {
      // WITHDRAW_REQUEST(-)가 즉시 차감됐으므로 잔액·내역을 갱신한다(Realtime 미수신 대비).
      queryClient.invalidateQueries({ queryKey: queryKeys.balance(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger(userId) });
    }
  }

  function goBackToWallet() {
    navigate("/wallet", { replace: true });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto", backgroundColor: surface.app, minHeight: "100vh" }}>
      <PageHeader title="출금 신청" onBack={() => navigate("/wallet")} backTestId="withdraw-back" />

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
              style={{ marginTop: 12, minHeight: 44, background: "none", border: "none", color: colors.primary.DEFAULT, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              계좌 정보 수정
            </button>
          </div>
        )}
        {showBankForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
              출금 받을 계좌를 먼저 등록해주세요.
            </p>
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

      {error && (
        <p role="alert" data-testid="withdraw-error" style={{ margin: 0, fontSize: 14, color: colors.status.danger }}>
          {error}
        </p>
      )}

      <BigButton
        data-testid="withdraw-submit-button"
        onClick={handleSubmit}
        loading={submitting}
        disabled={!bankAccount || showBankForm}
      >
        출금 신청하기
      </BigButton>

      {/* 성공 시트 — 확인/닫기 모두 지갑으로 복귀(신청 직후 이 화면에 남을 이유가 없다). */}
      <ConfirmSheet
        open={success != null}
        onClose={goBackToWallet}
        title="출금 신청이 접수됐어요"
        description={`신청 금액 ${formatPoint(success?.amount ?? 0)} · 관리자 승인 후 계좌로 이체돼요. 반려되면 포인트가 다시 복구돼요.`}
        confirmLabel="지갑으로 돌아가기"
        cancelLabel="닫기"
        onConfirm={goBackToWallet}
      />
    </main>
  );
}

import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  LedgerList,
  PayoutMethodChip,
  PointBalanceCard,
  PointHeroAction,
  colors,
  elevation,
  gray,
  radius,
  surface,
  typeScale,
} from "@oilpick/ui";
import { MIN_WITHDRAW, formatKg, formatKrw, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useLedger, usePointBalance } from "../hooks/useWallet";
import { useCashReceipts } from "../hooks/useCashReceipts";

/**
 * U11 지갑 — 08 G5-①로 포인트 지갑 부활(07 F8의 "수령 이력" 단독 화면을 대체).
 * 위→아래: 잔액 히어로(v_point_balance available/held + [출금 신청] CTA) → 포인트 내역
 * (LedgerList variant="point", point_ledger 본인 행) → 수령 이력(주문별 확정 지급액 +
 * PayoutMethodChip 현금/포인트 구분). Realtime은 usePointBalance가 point_ledger INSERT를
 * 구독해 잔액·내역을 함께 invalidate한다. 원장 쓰기는 어디에도 없다(CLAUDE.md 절대 규칙 1).
 * 탭바(AppShell)가 셸을 제공하므로 이 화면은 UserShell로 감싸지 않는다.
 */
export function WalletPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: balance, isLoading: balanceLoading } = usePointBalance(userId);
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    refetch: refetchLedger,
  } = useLedger(userId);
  const {
    data: receipts,
    isLoading: receiptsLoading,
    isError: receiptsError,
    refetch: refetchReceipts,
  } = useCashReceipts(userId);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다.
  const ledgerLoadFailed = ledgerError && ledger === undefined;
  const receiptsLoadFailed = receiptsError && receipts === undefined;

  const available = balance?.available ?? 0;
  const canWithdraw = available >= MIN_WITHDRAW;

  // 이력 목록 재시도 버튼(기존 수령 이력 화면과 동일 톤의 작은 outline 버튼).
  const retryButtonStyle = {
    minHeight: 44,
    padding: "0 20px",
    borderRadius: radius.button,
    border: `1px solid ${surface.border}`,
    backgroundColor: surface.card,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <main
      data-testid="wallet-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: 20,
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: surface.app,
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: typeScale.title, margin: 0 }}>지갑</h1>

      {/* 잔액 히어로 — v_point_balance available 크게 + held 보조 + [출금 신청] CTA. */}
      {balanceLoading ? (
        <div data-testid="wallet-balance-skeleton" style={{ borderRadius: radius.hero, height: 160, backgroundColor: gray[100] }} />
      ) : (
        <section data-testid="wallet-balance-hero" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PointBalanceCard
            available={available}
            held={balance?.held ?? 0}
            action={
              <PointHeroAction
                data-testid="wallet-withdraw-button"
                disabled={!canWithdraw}
                onClick={() => navigate("/wallet/withdraw")}
              >
                출금 신청
              </PointHeroAction>
            }
          />
          {!canWithdraw && (
            <p data-testid="wallet-withdraw-min-caption" style={{ margin: 0, fontSize: typeScale.caption, color: colors.status.wait }}>
              {formatPoint(MIN_WITHDRAW)}부터 출금을 신청할 수 있어요.
            </p>
          )}
        </section>
      )}

      {/* 포인트 내역 — point_ledger 본인 행(EARN·출금·조정 + 레거시 HOLD 표시). */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: typeScale.body, margin: 0, color: colors.status.wait }}>포인트 내역</h2>
        {ledgerLoading ? (
          <div data-testid="wallet-ledger-skeleton" style={{ borderRadius: radius.card, height: 140, backgroundColor: gray[100] }} />
        ) : ledgerLoadFailed ? (
          // 쿼리 실패는 빈 상태로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다.
          <div data-testid="wallet-ledger-error">
            <EmptyState
              title="불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <button type="button" data-testid="wallet-ledger-retry" onClick={() => refetchLedger()} style={retryButtonStyle}>
                  다시 시도
                </button>
              }
            />
          </div>
        ) : ledger && ledger.length > 0 ? (
          <div
            style={{
              borderRadius: radius.card,
              border: `1px solid ${surface.border}`,
              backgroundColor: surface.card,
              boxShadow: elevation.card,
              padding: "0 16px",
            }}
          >
            <LedgerList entries={ledger} variant="point" />
          </div>
        ) : (
          <EmptyState
            title="아직 포인트 내역이 없어요"
            description="포인트로 지급받은 매각대금이 여기에 쌓여요."
          />
        )}
      </section>

      {/* 수령 이력 — 주문별 확정 지급액. PayoutMethodChip으로 현금/포인트 구분(레거시 null=현금). */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: typeScale.body, margin: 0, color: colors.status.wait }}>수령 이력</h2>
        {receiptsLoading ? (
          <div data-testid="receipts-skeleton" style={{ borderRadius: radius.card, height: 200, backgroundColor: gray[100] }} />
        ) : receiptsLoadFailed ? (
          <div data-testid="query-error">
            <EmptyState
              title="불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <button type="button" data-testid="query-error-retry" onClick={() => refetchReceipts()} style={retryButtonStyle}>
                  다시 시도
                </button>
              }
            />
          </div>
        ) : receipts && receipts.length > 0 ? (
          <ul data-testid="receipts-list" className="oilpick-stagger" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {receipts.map((receipt) => {
              // payout_method null = 레거시 주문 → CASH 간주(08 P3 coalesce).
              const method = receipt.payoutMethod ?? "CASH";
              return (
                <li
                  key={receipt.id}
                  data-testid="receipt-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: `1px solid ${surface.border}`,
                    borderRadius: radius.card,
                    padding: "14px 16px",
                    backgroundColor: surface.card,
                    boxShadow: elevation.card,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 13, color: colors.status.wait }}>
                      {new Date(receipt.receivedAt).toLocaleDateString("ko-KR")}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <PayoutMethodChip method={method} />
                      {receipt.finalKg != null && <span style={{ fontSize: 14 }}>{formatKg(receipt.finalKg)}</span>}
                    </span>
                  </div>
                  <span
                    className="oilpick-tabular-nums"
                    style={{
                      fontSize: typeScale.title,
                      fontWeight: 800,
                      color: method === "POINT" ? colors.accent.deep : colors.status.done,
                    }}
                  >
                    {method === "POINT" ? formatPoint(receipt.amount) : formatKrw(receipt.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="아직 수령 내역이 없어요"
            description="수거가 완료되면 현장에서 받은 현금이나 적립된 포인트가 여기에 기록돼요."
          />
        )}
      </section>
    </main>
  );
}

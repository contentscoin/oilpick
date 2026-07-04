import { useNavigate } from "react-router-dom";
import { BigButton, EmptyState, LedgerList, PointBalanceCard, colors, radius } from "@oilpick/ui";
import { formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { usePointBalance, useLedger, useEarningsSummary } from "../hooks/useEarnings";

/**
 * R7/R8 정산. 03-frontend.md: "PointBalanceCard(held 강조: '배송완료 시 확정') + 일/주 합계 +
 * 출금". held 강조는 PointBalanceCard(packages/ui) 자체가 "지급 확정 대기 nP" 문구로 이미
 * 처리한다.
 */
export function EarningsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: balance, isLoading: balanceLoading } = usePointBalance(userId);
  const { data: entries, isLoading: ledgerLoading } = useLedger(userId);
  const { today, week } = useEarningsSummary(userId);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>정산</h1>

      {balanceLoading ? (
        <div data-testid="balance-skeleton" style={{ borderRadius: 16, height: 96, backgroundColor: "#f4f4f5" }} />
      ) : (
        <PointBalanceCard available={balance?.available ?? 0} held={balance?.held ?? 0} />
      )}

      <section style={{ display: "flex", gap: 12 }}>
        <div
          data-testid="earnings-today"
          style={{ flex: 1, borderRadius: radius.card, padding: 16, backgroundColor: colors.accent.light }}
        >
          <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>오늘 확정 지급</p>
          <p className="oilpick-tabular-nums" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: colors.accent.DEFAULT }}>
            {formatPoint(today.releasedPoint)}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.status.wait }}>{today.count}건</p>
        </div>
        <div
          data-testid="earnings-week"
          style={{ flex: 1, borderRadius: radius.card, padding: 16, backgroundColor: colors.primary.light }}
        >
          <p style={{ margin: 0, fontSize: 13, color: colors.primary.dark }}>이번 주 확정 지급</p>
          <p className="oilpick-tabular-nums" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: colors.primary.DEFAULT }}>
            {formatPoint(week.releasedPoint)}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.status.wait }}>{week.count}건</p>
        </div>
      </section>

      <BigButton data-testid="withdraw-request-button" onClick={() => navigate("/earnings/withdraw")}>
        출금 신청
      </BigButton>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0, color: colors.status.wait }}>포인트 내역</h2>
        {ledgerLoading ? (
          <div data-testid="ledger-skeleton" style={{ borderRadius: 16, height: 200, backgroundColor: "#f4f4f5" }} />
        ) : entries && entries.length > 0 ? (
          <LedgerList entries={entries} />
        ) : (
          <EmptyState title="아직 포인트 내역이 없어요" description="배송을 완료하면 여기에 표시돼요." />
        )}
      </section>
    </main>
  );
}

import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  LedgerList,
  PointBalanceCard,
  PointHeroAction,
  colors,
  gray,
} from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { usePointBalance, useLedger } from "../hooks/useWallet";
import { UserShell } from "../components/UserShell";

/**
 * U11 지갑. 03-frontend.md: "PointBalanceCard(packages/ui) + LedgerList(packages/ui,
 * point_ledger 조회) + [출금 신청] 버튼".
 */
export function WalletPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: balance, isLoading: balanceLoading } = usePointBalance(userId);
  const { data: entries, isLoading: ledgerLoading } = useLedger(userId);

  return (
    <UserShell>
      <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>지갑</h1>

        {balanceLoading ? (
          <div data-testid="balance-skeleton" style={{ borderRadius: 16, height: 96, backgroundColor: gray[100] }} />
        ) : (
          <PointBalanceCard
            available={balance?.available ?? 0}
            held={balance?.held ?? 0}
            action={
              <PointHeroAction
                data-testid="withdraw-request-button"
                onClick={() => navigate("/wallet/withdraw")}
              >
                출금 신청
              </PointHeroAction>
            }
          />
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0, color: colors.status.wait }}>포인트 내역</h2>
          {ledgerLoading ? (
            <div data-testid="ledger-skeleton" style={{ borderRadius: 16, height: 200, backgroundColor: gray[100] }} />
          ) : entries && entries.length > 0 ? (
            <LedgerList entries={entries} />
          ) : (
            <EmptyState title="아직 포인트 내역이 없어요" description="수거가 완료되면 여기에 표시돼요." />
          )}
        </section>
      </main>
    </UserShell>
  );
}

import {
  EmptyState,
  colors,
  elevation,
  gradient,
  gray,
  radius,
  surface,
  surfaceDark,
  typeScale,
} from "@oilpick/ui";
import { formatKg, formatKrw } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useCashReceipts, useMonthlyCashReceipt } from "../hooks/useCashReceipts";

/**
 * U11 "수령 이력" — 07 F8/D1. 구모델 지갑(포인트 잔액·출금)을 폐기하고 현장 현금 수령 이력으로 대체.
 * 상단: 이번 달 수령 총액 히어로. 하단: 주문별 현금 수령 리스트(날짜/kg/₩N, COMPLETED+cash_paid_amount).
 * 탭바(AppShell)가 셸을 제공하므로 이 화면은 UserShell로 감싸지 않는다.
 */
export function WalletPage() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: monthly, isLoading: monthlyLoading } = useMonthlyCashReceipt(userId);
  const {
    data: receipts,
    isLoading: receiptsLoading,
    isError: receiptsError,
    refetch: refetchReceipts,
  } = useCashReceipts(userId);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다.
  const receiptsLoadFailed = receiptsError && receipts === undefined;

  return (
    <main
      data-testid="receipts-page"
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
      <h1 style={{ fontSize: typeScale.title, margin: 0 }}>수령 이력</h1>

      {/* 이번 달 수령 총액 히어로 */}
      {monthlyLoading ? (
        <div data-testid="receipts-month-skeleton" style={{ borderRadius: radius.hero, height: 96, backgroundColor: gray[100] }} />
      ) : (
        <section
          data-testid="receipts-month-total"
          style={{
            background: gradient.heroDeep,
            borderRadius: radius.hero,
            boxShadow: elevation.heroDark,
            padding: 20,
            color: surfaceDark.textOnDark,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontSize: typeScale.label, fontWeight: 500, color: surfaceDark.textOnDarkMuted }}>이번 달 수령</span>
          <span className="oilpick-tabular-nums" style={{ fontSize: typeScale.display, fontWeight: 800, lineHeight: 1.05 }}>
            {formatKrw(monthly?.cash ?? 0)}
          </span>
          <span style={{ fontSize: typeScale.label, color: surfaceDark.textOnDarkMuted }}>
            수거 {monthly?.count ?? 0}건 · 현장 현금 수령
          </span>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: typeScale.body, margin: 0, color: colors.status.wait }}>수령 내역</h2>
        {receiptsLoading ? (
          <div data-testid="receipts-skeleton" style={{ borderRadius: radius.card, height: 200, backgroundColor: gray[100] }} />
        ) : receiptsLoadFailed ? (
          // 쿼리 실패는 빈 상태로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다.
          <div data-testid="query-error">
            <EmptyState
              title="불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <button
                  type="button"
                  data-testid="query-error-retry"
                  onClick={() => refetchReceipts()}
                  style={{
                    minHeight: 44,
                    padding: "0 20px",
                    borderRadius: radius.button,
                    border: `1px solid ${surface.border}`,
                    backgroundColor: surface.card,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  다시 시도
                </button>
              }
            />
          </div>
        ) : receipts && receipts.length > 0 ? (
          <ul data-testid="receipts-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {receipts.map((receipt) => (
              <li
                key={receipt.id}
                data-testid="receipt-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: `1px solid ${surface.border}`,
                  borderRadius: radius.card,
                  padding: "14px 16px",
                  backgroundColor: surface.card,
                  boxShadow: elevation.card,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, color: colors.status.wait }}>
                    {new Date(receipt.receivedAt).toLocaleDateString("ko-KR")}
                  </span>
                  {receipt.finalKg != null && (
                    <span style={{ fontSize: 14 }}>{formatKg(receipt.finalKg)}</span>
                  )}
                </div>
                <span
                  className="oilpick-tabular-nums"
                  style={{ fontSize: typeScale.title, fontWeight: 800, color: colors.status.done }}
                >
                  {formatKrw(receipt.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="아직 수령 내역이 없어요" description="수거가 완료되면 현장에서 받은 현금이 여기에 기록돼요." />
        )}
      </section>
    </main>
  );
}

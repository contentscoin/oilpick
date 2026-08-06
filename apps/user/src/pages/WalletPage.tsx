import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  LedgerList,
  PayoutMethodChip,
  PayoutTaxNotice,
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
import { LEDGER_PAGE_SIZE, useLedger, usePointBalance } from "../hooks/useWallet";
import { useCashReceipts } from "../hooks/useCashReceipts";
import { useWithdrawals, type WithdrawStatus } from "../hooks/useWithdrawals";

/**
 * 출금 상태 뱃지 카피·톤 — 00-domain.md 출금 규칙(REQUESTED→APPROVED→PAID / REJECTED 시
 * WITHDRAW_CANCEL 복구)의 유저 언어. 진행중(REQUESTED/APPROVED)은 유채색 강조,
 * 완결(PAID/REJECTED)은 회색 톤.
 */
const WITHDRAW_STATUS_META: Record<
  WithdrawStatus,
  { label: string; active: boolean; color: string; background: string }
> = {
  REQUESTED: {
    label: "확정 대기",
    active: true,
    color: colors.status.active,
    background: "rgba(59,130,246,0.12)", // status.active(#3B82F6)의 연한 배경(토큰에 라이트 변형 없음)
  },
  APPROVED: {
    label: "지급 준비중",
    active: true,
    color: colors.primary.DEFAULT,
    background: colors.primary.light,
  },
  PAID: { label: "지급 완료", active: false, color: gray[600], background: gray[100] },
  REJECTED: { label: "반려 — 포인트 복구됨", active: false, color: gray[600], background: gray[100] },
};

/**
 * U11 지갑 — 08 G5-①로 포인트 지갑 부활(07 F8의 "수령 이력" 단독 화면을 대체).
 * 위→아래: 잔액 히어로(v_point_balance available/held + [출금 신청] CTA) → 출금 진행
 * (withdrawals 본인 행 — 승인/지급은 원장 무기록(08 P4)이라 포인트 내역에 안 보이므로
 * 신청~지급 여정은 이 섹션이 유일한 창구) → 포인트 내역(LedgerList variant="point",
 * point_ledger 본인 행 + [더 보기] 50건씩) → 수령 이력(주문별 확정 지급액 + PayoutMethodChip
 * 현금/포인트 구분). Realtime은 usePointBalance가 point_ledger INSERT를 구독해 잔액·내역을
 * 함께 invalidate한다. 원장 쓰기는 어디에도 없다(CLAUDE.md 절대 규칙 1).
 * 탭바(AppShell)가 셸을 제공하므로 이 화면은 UserShell로 감싸지 않는다.
 */
export function WalletPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;

  // [더 보기]가 50씩 늘리는 포인트 내역 조회 한도(캐시 키에 포함 — useLedger).
  const [ledgerLimit, setLedgerLimit] = useState<number>(LEDGER_PAGE_SIZE);

  const { data: balance, isLoading: balanceLoading } = usePointBalance(userId);
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    isFetching: ledgerFetching,
    refetch: refetchLedger,
  } = useLedger(userId, ledgerLimit);
  const { data: withdrawals } = useWithdrawals(userId);
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
  const held = balance?.held ?? 0;

  // 출금 진행중(REQUESTED/APPROVED) 파생값 — 스탯 카드·섹션 헤더 병기용.
  const withdrawalList = withdrawals ?? [];
  const inProgressWithdrawals = withdrawalList.filter((w) => WITHDRAW_STATUS_META[w.status].active);
  const inProgressTotal = inProgressWithdrawals.reduce((sum, w) => sum + w.amount, 0);

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

  // [15] 목업의 잔액 하단 2열 스탯 카드.
  const statCardStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: surface.card,
    border: `1px solid ${surface.border}`,
    boxShadow: elevation.card,
  } as const;
  const statLabelStyle = { fontSize: typeScale.caption, color: colors.status.wait } as const;
  // [M] minWidth:0 — 글자 확대 시 긴 금액이 스탯 칸을 밀어내지 않고 행 단위로 개행되게.
  const statValueStyle = { fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", minWidth: 0 } as const;

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
          {/* [15] 목업 월렛 카드 — 지갑은 화면에서 가장 무거운 다크 패널이 된다.
              라벨/잔액/CTA 구성은 그대로 두고 톤만 바꾼다(정보구조 불변). */}
          <PointBalanceCard
            tone="dark"
            available={available}
            held={held}
            // held는 레거시 HOLD 잔존 표시일 뿐 지급 대기 금액이 아니다(00-domain.md 레거시
            // entry_type) — 기본 라벨 "지급 확정 대기"가 오독을 만들어 교정한다(pill은 held>0만 노출).
            heldLabel="보류(레거시)"
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
          {/* 출금 진행중/사용 가능 스탯 페어 — 목업의 잔액 하단 2열.
              (구현 이력: held를 "지급 확정 대기"로 표기했으나 held는 레거시 HOLD 전용이라
              신규 유저는 항상 0 — 출금 대기 금액으로 오독되어 출금 진행중 합계로 교체.) */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
            <div data-testid="wallet-withdraw-inprogress-stat" style={statCardStyle}>
              <span style={statLabelStyle}>출금 진행중</span>
              <span className="oilpick-tabular-nums" style={statValueStyle}>
                {formatPoint(inProgressTotal)}
              </span>
            </div>
            <div data-testid="wallet-available-stat" style={statCardStyle}>
              <span style={statLabelStyle}>사용 가능</span>
              <span className="oilpick-tabular-nums" style={statValueStyle}>
                {formatPoint(available)}
              </span>
            </div>
            {/* 레거시 HOLD 잔존분만 보조 스탯으로 — 00-domain.md: "잔존 HOLD는 held 표시로만
                남는 과거 회계 기록, 지급 의무 아님". held=0(신규 유저 전부)이면 미노출. */}
            {held > 0 && (
              <div data-testid="wallet-held-legacy-stat" style={{ ...statCardStyle, gridColumn: "1 / -1" }}>
                <span style={statLabelStyle}>보류(레거시)</span>
                <span className="oilpick-tabular-nums" style={statValueStyle}>{formatPoint(held)}</span>
                <span style={{ fontSize: typeScale.caption, color: colors.status.wait }}>
                  구모델의 과거 회계 기록이에요 — 지급 예정 금액이 아니에요.
                </span>
              </div>
            )}
          </div>
          {!canWithdraw && (
            <p data-testid="wallet-withdraw-min-caption" style={{ margin: 0, fontSize: typeScale.caption, color: colors.status.wait }}>
              {formatPoint(MIN_WITHDRAW)}부터 출금을 신청할 수 있어요.
            </p>
          )}
          {/* [08 Q2·Q3] 포인트=부가세 포함·플랫폼 내 사용 무공제·출금 공제 요약. */}
          <PayoutTaxNotice context="wallet" data-testid="wallet-tax-notice" />
        </section>
      )}

      {/* 출금 진행 — withdrawals 본인 행 최근 20건(useWithdrawals). 승인/지급 전이는 원장
          무기록(08 P4)이라 포인트 내역만으로는 신청 후 여정이 안 보인다 — 이 섹션이 유일한 창구.
          이력 0건(로딩·미신청 유저)이면 섹션 자체를 미노출해 레이아웃 점프를 만들지 않는다. */}
      {withdrawalList.length > 0 && (
        <section data-testid="wallet-withdrawals-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2
            style={{
              fontSize: typeScale.body,
              margin: 0,
              color: colors.status.wait,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span>출금 진행</span>
            {inProgressWithdrawals.length > 0 && (
              <span
                data-testid="wallet-withdrawals-summary"
                className="oilpick-tabular-nums"
                style={{ fontSize: typeScale.caption, fontWeight: 600 }}
              >
                진행중 {inProgressWithdrawals.length}건 · 합계 {formatPoint(inProgressTotal)}
              </span>
            )}
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {withdrawalList.map((w) => {
              const meta = WITHDRAW_STATUS_META[w.status];
              return (
                <li
                  key={w.id}
                  data-testid="withdrawal-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap", // [M] 글자 확대 시 날짜·뱃지·금액이 자연 개행(고정 height 없음)
                    gap: 8,
                    borderRadius: radius.card,
                    padding: "12px 16px",
                    // 진행중 행은 카드 톤+엘리베이션 강조, 완결(지급/반려) 행은 회색 톤으로 가라앉힌다.
                    border: `1px solid ${meta.active ? surface.border : gray[100]}`,
                    backgroundColor: meta.active ? surface.card : gray[50],
                    boxShadow: meta.active ? elevation.card : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: colors.status.wait }}>
                      {new Date(w.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                    <span
                      data-testid="withdrawal-status-badge"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px", // [M] 고정 width/height 금지 — padding으로만 확보
                        borderRadius: 999,
                        fontSize: typeScale.caption,
                        fontWeight: 700,
                        color: meta.color,
                        backgroundColor: meta.background,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span
                    className="oilpick-tabular-nums"
                    style={{ fontSize: typeScale.body, fontWeight: 800, color: meta.active ? undefined : gray[500] }}
                  >
                    {formatPoint(w.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
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
          <>
            {/* [15] 원장 행은 좌스와이프로 문의 액션을 드러낸다. 스와이프는 추가 경로일 뿐이고,
                액션 버튼은 항상 DOM에 있어 키보드·스크린리더로도 도달한다(SwipeableRow). */}
            <LedgerList
              entries={ledger}
              variant="point"
              rowActionLabel="문의"
              onRowAction={() => navigate("/support")}
            />
            {/* [더 보기] — 반환 행수가 limit에 찼을 때만(미만이면 마지막 페이지라 숨김).
                50씩 늘려 잔액(v_point_balance 전체 집계)과 내역 대사가 가능하게 한다. */}
            {ledger.length >= ledgerLimit && (
              <button
                type="button"
                data-testid="wallet-ledger-more"
                disabled={ledgerFetching}
                onClick={() => setLedgerLimit((prev) => prev + LEDGER_PAGE_SIZE)}
                style={retryButtonStyle}
              >
                더 보기
              </button>
            )}
          </>
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
                    flexWrap: "wrap",
                    gap: 12,
                    border: `1px solid ${surface.border}`,
                    borderRadius: radius.card,
                    padding: "14px 16px",
                    backgroundColor: surface.card,
                    boxShadow: elevation.card,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
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

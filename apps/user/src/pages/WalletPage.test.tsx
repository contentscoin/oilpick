import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPage } from "./WalletPage";

// 08 G5-① 포인트 지갑 부활 — 잔액 히어로(+출금 CTA)·포인트 내역·수령 이력(현금/포인트 칩).

const { mockUseSession, mockUsePointBalance, mockUseLedger, mockUseCashReceipts, mockUseWithdrawals } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUsePointBalance: vi.fn(),
    mockUseLedger: vi.fn(),
    mockUseCashReceipts: vi.fn(),
    mockUseWithdrawals: vi.fn(),
  }));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useWallet", () => ({
  LEDGER_PAGE_SIZE: 50,
  usePointBalance: mockUsePointBalance,
  useLedger: mockUseLedger,
}));
vi.mock("../hooks/useCashReceipts", () => ({ useCashReceipts: mockUseCashReceipts }));
vi.mock("../hooks/useWithdrawals", () => ({ useWithdrawals: mockUseWithdrawals }));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/wallet"]}>
      <Routes>
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/wallet/withdraw" element={<div data-testid="withdraw-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WalletPage (08 포인트 지갑)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUsePointBalance.mockReturnValue(ok({ available: 21000, held: 0 }));
    mockUseLedger.mockReturnValue(
      ok([{ id: 1, entryType: "EARN", amount: 21000, createdAt: new Date().toISOString() }]),
    );
    mockUseCashReceipts.mockReturnValue(
      ok([
        { id: "a", amount: 21000, payoutMethod: "POINT", finalKg: 30, receivedAt: new Date().toISOString() },
        { id: "b", amount: 15000, payoutMethod: null, finalKg: 15, receivedAt: new Date().toISOString() },
      ]),
    );
    mockUseWithdrawals.mockReturnValue(ok([]));
  });

  it("잔액 히어로(available P)와 포인트 내역(EARN=매각대금)을 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("wallet-balance-hero")).toBeInTheDocument();
    expect(screen.getByTestId("point-balance-card")).toHaveTextContent("21,000P");
    expect(screen.getByText("매각대금")).toBeInTheDocument();
  });

  it("잔액 ≥ 10,000P면 [출금 신청]으로 /wallet/withdraw 이동", () => {
    renderPage();
    const cta = screen.getByTestId("wallet-withdraw-button");
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    expect(screen.getByTestId("withdraw-page")).toBeInTheDocument();
  });

  it("잔액 < 10,000P면 출금 CTA 비활성 + 최소액 캡션", () => {
    mockUsePointBalance.mockReturnValue(ok({ available: 5000, held: 0 }));
    renderPage();
    expect(screen.getByTestId("wallet-withdraw-button")).toBeDisabled();
    expect(screen.getByTestId("wallet-withdraw-min-caption")).toHaveTextContent("10,000P");
  });

  it("수령 이력에 지급수단 칩(포인트/현금 — 레거시 null=현금)을 구분 렌더한다", () => {
    renderPage();
    const items = screen.getAllByTestId("receipt-item");
    expect(items).toHaveLength(2);
    const chips = screen.getAllByTestId("payout-method-chip");
    expect(chips[0]).toHaveTextContent("포인트");
    expect(chips[1]).toHaveTextContent("현금");
  });

  it("내역 로드 실패 시 빈 상태로 위장하지 않고 재시도 UI를 띄운다", () => {
    mockUseLedger.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderPage();
    expect(screen.getByTestId("wallet-ledger-error")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-ledger-retry")).toBeInTheDocument();
  });

  // ===== 출금 진행 섹션 (useWithdrawals — 승인/지급은 원장 무기록이라 이 섹션이 유일한 창구) =====

  const nowIso = new Date().toISOString();

  it("출금 진행 섹션 — 상태 4종 뱃지(확정 대기/지급 준비중/지급 완료/반려)를 렌더한다", () => {
    mockUseWithdrawals.mockReturnValue(
      ok([
        { id: "w1", amount: 10000, status: "REQUESTED", createdAt: nowIso, processedAt: null },
        { id: "w2", amount: 20000, status: "APPROVED", createdAt: nowIso, processedAt: nowIso },
        { id: "w3", amount: 30000, status: "PAID", createdAt: nowIso, processedAt: nowIso },
        { id: "w4", amount: 40000, status: "REJECTED", createdAt: nowIso, processedAt: nowIso },
      ]),
    );
    renderPage();
    expect(screen.getByTestId("wallet-withdrawals-section")).toBeInTheDocument();
    expect(screen.getAllByTestId("withdrawal-item")).toHaveLength(4);
    expect(screen.getByText("확정 대기")).toBeInTheDocument();
    expect(screen.getByText("지급 준비중")).toBeInTheDocument();
    expect(screen.getByText("지급 완료")).toBeInTheDocument();
    expect(screen.getByText("반려 — 포인트 복구됨")).toBeInTheDocument();
  });

  it("출금 이력이 0건이면 출금 진행 섹션을 노출하지 않는다", () => {
    renderPage(); // beforeEach 기본값: withdrawals []
    expect(screen.queryByTestId("wallet-withdrawals-section")).not.toBeInTheDocument();
  });

  it("진행중(REQUESTED+APPROVED) 합계를 섹션 헤더에 병기하고 스탯 카드에도 반영한다", () => {
    mockUseWithdrawals.mockReturnValue(
      ok([
        { id: "w1", amount: 10000, status: "REQUESTED", createdAt: nowIso, processedAt: null },
        { id: "w2", amount: 20000, status: "APPROVED", createdAt: nowIso, processedAt: nowIso },
        { id: "w3", amount: 55000, status: "PAID", createdAt: nowIso, processedAt: nowIso }, // 완결 — 합계 제외
      ]),
    );
    renderPage();
    expect(screen.getByTestId("wallet-withdrawals-summary")).toHaveTextContent("진행중 2건 · 합계 30,000P");
    expect(screen.getByTestId("wallet-withdraw-inprogress-stat")).toHaveTextContent("출금 진행중");
    expect(screen.getByTestId("wallet-withdraw-inprogress-stat")).toHaveTextContent("30,000P");
  });

  it("진행중 출금이 없으면 헤더 병기를 생략한다(완결 이력만 있는 경우)", () => {
    mockUseWithdrawals.mockReturnValue(
      ok([{ id: "w1", amount: 30000, status: "PAID", createdAt: nowIso, processedAt: nowIso }]),
    );
    renderPage();
    expect(screen.getByTestId("wallet-withdrawals-section")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-withdrawals-summary")).not.toBeInTheDocument();
  });

  // ===== held 스탯 교정 (00-domain.md — held는 레거시 HOLD 잔존 표시, 지급 의무 아님) =====

  it("held=0(신규 유저)이면 레거시 보류 스탯을 노출하지 않는다", () => {
    renderPage(); // beforeEach 기본값: held 0
    expect(screen.queryByTestId("wallet-held-legacy-stat")).not.toBeInTheDocument();
    expect(screen.queryByText("지급 확정 대기")).not.toBeInTheDocument(); // 오표기 라벨 제거 확인
  });

  it("held>0(레거시 HOLD 잔존)이면 보류(레거시) 스탯 + 지급 예정 아님 카피를 노출한다", () => {
    mockUsePointBalance.mockReturnValue(ok({ available: 21000, held: 4200 }));
    renderPage();
    const legacyStat = screen.getByTestId("wallet-held-legacy-stat");
    expect(legacyStat).toHaveTextContent("보류(레거시)");
    expect(legacyStat).toHaveTextContent("4,200P");
    expect(legacyStat).toHaveTextContent("지급 예정 금액이 아니에요");
  });

  // ===== 포인트 내역 [더 보기] (useLedger limit 파라미터화) =====

  const ledgerRows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      entryType: "EARN",
      amount: 100,
      createdAt: nowIso,
    }));

  it("반환 행수가 limit에 차면 [더 보기]가 보이고, 클릭 시 limit을 50 늘려 재조회한다", () => {
    mockUseLedger.mockReturnValue(ok(ledgerRows(50)));
    renderPage();
    expect(mockUseLedger).toHaveBeenLastCalledWith("user-1", 50);
    const more = screen.getByTestId("wallet-ledger-more");
    fireEvent.click(more);
    expect(mockUseLedger).toHaveBeenLastCalledWith("user-1", 100);
  });

  it("반환 행수가 limit 미만이면 [더 보기]를 숨긴다(마지막 페이지)", () => {
    renderPage(); // beforeEach 기본값: 1행 < 50
    expect(screen.queryByTestId("wallet-ledger-more")).not.toBeInTheDocument();
  });
});

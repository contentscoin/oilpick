import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPage } from "./WalletPage";

// 08 G5-① 포인트 지갑 부활 — 잔액 히어로(+출금 CTA)·포인트 내역·수령 이력(현금/포인트 칩).

const { mockUseSession, mockUsePointBalance, mockUseLedger, mockUseCashReceipts } = vi.hoisted(
  () => ({
    mockUseSession: vi.fn(),
    mockUsePointBalance: vi.fn(),
    mockUseLedger: vi.fn(),
    mockUseCashReceipts: vi.fn(),
  }),
);

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useWallet", () => ({
  usePointBalance: mockUsePointBalance,
  useLedger: mockUseLedger,
}));
vi.mock("../hooks/useCashReceipts", () => ({ useCashReceipts: mockUseCashReceipts }));

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
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawPage } from "./WithdrawPage";

// 08 G5-② 출금 신청 부활 — 계좌 표시/등록, 최소액·잔액 fail-fast, withdraw-request 호출.

const { mockUseSession, mockUsePointBalance, mockUseBankAccount, mockSaveBankAccount, mockInvoke } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUsePointBalance: vi.fn(),
    mockUseBankAccount: vi.fn(),
    mockSaveBankAccount: vi.fn(),
    mockInvoke: vi.fn(),
  }));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useWallet", () => ({ usePointBalance: mockUsePointBalance }));
vi.mock("../hooks/useBankAccount", () => ({
  useBankAccount: mockUseBankAccount,
  useSaveBankAccount: () => mockSaveBankAccount,
}));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/wallet/withdraw"]}>
        <WithdrawPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WithdrawPage (08 출금 신청)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUsePointBalance.mockReturnValue({ data: { available: 21000, held: 0 }, isLoading: false });
    mockUseBankAccount.mockReturnValue({
      data: { bankName: "국민은행", bankAccount: "000-00", bankHolder: "홍길동" },
      isLoading: false,
    });
  });

  it("등록된 계좌를 표시하고 잔액 히어로를 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("bank-account-display")).toHaveTextContent("국민은행");
    expect(screen.getByTestId("point-balance-card")).toHaveTextContent("21,000P");
  });

  it("계좌 미등록이면 등록 폼을 보여준다", () => {
    mockUseBankAccount.mockReturnValue({ data: null, isLoading: false });
    renderPage();
    expect(screen.getByTestId("bank-name-input")).toBeInTheDocument();
    expect(screen.queryByTestId("bank-account-display")).not.toBeInTheDocument();
  });

  it("최소액(10,000P) 미만은 서버 호출 없이 fail-fast", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("withdraw-amount-input"), { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("withdraw-submit-button"));
    expect(screen.getByTestId("withdraw-error")).toHaveTextContent("10,000P");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("잔액 초과는 서버 호출 없이 fail-fast", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("withdraw-amount-input"), { target: { value: "99999" } });
    fireEvent.click(screen.getByTestId("withdraw-submit-button"));
    expect(screen.getByTestId("withdraw-error")).toHaveTextContent("잔액을 초과");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("유효 금액이면 withdraw-request를 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { withdrawalId: "w-1", status: "REQUESTED", amount: 15000 } });
    renderPage();
    fireEvent.change(screen.getByTestId("withdraw-amount-input"), { target: { value: "15000" } });
    fireEvent.click(screen.getByTestId("withdraw-submit-button"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("withdraw-request", { amount: 15000 }));
  });

  it("서버 에러(INSUFFICIENT_BALANCE 등)는 한국어 메시지로 표면화한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, code: "INSUFFICIENT_BALANCE", message: "출금 가능 잔액이 부족해요." });
    renderPage();
    fireEvent.change(screen.getByTestId("withdraw-amount-input"), { target: { value: "15000" } });
    fireEvent.click(screen.getByTestId("withdraw-submit-button"));
    await waitFor(() => expect(screen.getByTestId("withdraw-error")).toHaveTextContent("출금 가능 잔액이 부족해요."));
  });
});

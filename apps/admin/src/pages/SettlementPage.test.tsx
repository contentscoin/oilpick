import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettlementPage } from "./SettlementPage";
import type { AdminWithdrawalRow } from "../hooks/useSettlementAdmin";

/**
 * SettlementPage 회귀 안전망 (T13).
 * - 출금 상태 전이 UI: REQUESTED엔 승인/반려, APPROVED엔 이체완료만 노출(03-frontend.md "/settlement")
 * - 출금/원장 상태 한글 라벨 표시
 * - 승인 버튼 클릭 시 withdraw-process(decision=APPROVED) 호출 페이로드
 *
 * 데이터 훅과 invokeEdgeFunction을 모킹해 표시/전이 로직만 검증한다(네트워크 미접촉).
 */

const { mockInvoke, mockWithdrawals, mockLedger, mockDailyTotals } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockWithdrawals: vi.fn(),
  mockLedger: vi.fn(),
  mockDailyTotals: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useSettlementAdmin", () => ({
  useAdminWithdrawals: (statusFilter: string) => mockWithdrawals(statusFilter),
  useAdminLedgerAudit: () => mockLedger(),
  useDailyLedgerTotals: () => mockDailyTotals(),
}));

function withdrawal(overrides: Partial<AdminWithdrawalRow> = {}): AdminWithdrawalRow {
  return {
    id: "wd-1",
    userId: "u-1",
    userName: "김라이더",
    amount: 30000,
    status: "REQUESTED",
    bankName: "국민",
    bankAccount: "1234",
    bankHolder: "김라이더",
    adminMemo: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function setup(withdrawals: AdminWithdrawalRow[]) {
  mockWithdrawals.mockReturnValue({ data: withdrawals, isLoading: false, refetch: vi.fn() });
  mockLedger.mockReturnValue({ data: [], isLoading: false });
  mockDailyTotals.mockReturnValue({ data: [] });
  return render(<SettlementPage />);
}

afterEach(() => {
  mockInvoke.mockReset();
  mockWithdrawals.mockReset();
  mockLedger.mockReset();
  mockDailyTotals.mockReset();
});

describe("SettlementPage 출금 큐", () => {
  it("REQUESTED 출금은 승인/반려 버튼을 노출하고 이체완료 버튼은 없다", () => {
    setup([withdrawal({ status: "REQUESTED" })]);
    expect(screen.getByTestId("withdrawal-approve-wd-1")).toBeInTheDocument();
    expect(screen.getByTestId("withdrawal-reject-wd-1")).toBeInTheDocument();
    expect(screen.queryByTestId("withdrawal-paid-wd-1")).not.toBeInTheDocument();
    // 상태 라벨(신청됨)이 행에 표시된다.
    expect(screen.getByTestId("withdrawal-row-wd-1")).toHaveTextContent("신청됨");
  });

  it("APPROVED 출금은 이체완료 버튼만 노출하고 승인/반려 버튼은 없다", () => {
    setup([withdrawal({ status: "APPROVED" })]);
    expect(screen.getByTestId("withdrawal-paid-wd-1")).toBeInTheDocument();
    expect(screen.queryByTestId("withdrawal-approve-wd-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("withdrawal-reject-wd-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("withdrawal-row-wd-1")).toHaveTextContent("승인됨(이체 대기)");
  });

  it("PAID/REJECTED 출금은 처리 버튼이 없다(최종 상태)", () => {
    setup([withdrawal({ id: "wd-2", status: "PAID" }), withdrawal({ id: "wd-3", status: "REJECTED" })]);
    expect(screen.queryByTestId("withdrawal-approve-wd-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("withdrawal-paid-wd-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("withdrawal-row-wd-2")).toHaveTextContent("이체 완료");
    expect(screen.getByTestId("withdrawal-row-wd-3")).toHaveTextContent("반려됨");
  });

  it("승인 클릭 시 withdraw-process(decision=APPROVED)를 메모와 함께 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    setup([withdrawal({ status: "REQUESTED" })]);
    fireEvent.change(screen.getByTestId("withdrawal-memo-wd-1"), { target: { value: "확인 완료" } });
    fireEvent.click(screen.getByTestId("withdrawal-approve-wd-1"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("withdraw-process", {
      withdrawalId: "wd-1",
      decision: "APPROVED",
      memo: "확인 완료",
    });
  });

  it("출금 신청이 없으면 안내 문구를 표시한다", () => {
    setup([]);
    expect(screen.getByText("해당 상태의 출금 신청이 없어요.")).toBeInTheDocument();
  });
});

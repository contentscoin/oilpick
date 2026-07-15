import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettlementPage } from "./SettlementPage";
import type {
  PickupStatsDailyRow,
  PointLedgerAuditRow,
  RiderPayoutSummary,
  WithdrawalRow,
} from "../hooks/useSettlementAdmin";

/**
 * SettlementPage "정산" 재편(08 G7-①) 검증:
 * - ⓐ 출금 큐: 상태 필터, REQUESTED [승인]/[반려(사유 필수)], APPROVED [지급 완료] → withdraw-process 호출
 * - ⓑ 수거 활동 추이: 현금/포인트 지급 분리 + 합계 카드
 * - ⓒ 라이더별 지급 실적(포인트 지급 = 오프라인 정산 근거)
 * - ⓓ 포인트 원장 감사(entry_type 라벨·부호)
 * - ⓔ 구모델 쿠폰 매출/결제/원장 UI 부재(08 P1)
 */

const { mockInvoke, mockWithdrawals, mockPickup, mockPayouts, mockLedger } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockWithdrawals: vi.fn(),
  mockPickup: vi.fn(),
  mockPayouts: vi.fn(),
  mockLedger: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useSettlementAdmin", () => ({
  useWithdrawals: (statusFilter: string) => mockWithdrawals(statusFilter),
  usePickupStatsDaily: () => mockPickup(),
  useRiderPayouts: () => mockPayouts(),
  usePointLedgerAudit: () => mockLedger(),
}));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

function makeWithdrawal(overrides: Partial<WithdrawalRow> = {}): WithdrawalRow {
  return {
    id: "w-1",
    userId: "u-1",
    userName: "데모 기름집",
    amount: 10000,
    status: "REQUESTED",
    bankName: "국민은행",
    bankAccount: "000-00",
    bankHolder: "데모 기름집",
    adminMemo: null,
    createdAt: new Date().toISOString(),
    processedAt: null,
    ...overrides,
  };
}

function setup({
  withdrawals = [makeWithdrawal()],
  pickup = [],
  payouts = [],
  ledger = [],
}: {
  withdrawals?: WithdrawalRow[];
  pickup?: PickupStatsDailyRow[];
  payouts?: RiderPayoutSummary[];
  ledger?: PointLedgerAuditRow[];
} = {}) {
  mockWithdrawals.mockReturnValue(ok(withdrawals));
  mockPickup.mockReturnValue(ok(pickup));
  mockPayouts.mockReturnValue(ok(payouts));
  mockLedger.mockReturnValue(ok(ledger));
  return render(<SettlementPage />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SettlementPage — 출금 큐(08 P4)", () => {
  it("REQUESTED 건에 [승인]/[반려] 버튼, 승인 클릭 시 withdraw-process 호출", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { withdrawalId: "w-1", status: "APPROVED" } });
    setup();
    const row = screen.getByTestId("withdraw-row-w-1");
    expect(row).toHaveTextContent("데모 기름집");
    expect(row).toHaveTextContent("10,000P");
    fireEvent.click(screen.getByTestId("withdraw-approve-w-1"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("withdraw-process", { withdrawalId: "w-1", decision: "APPROVED" }),
    );
  });

  it("반려는 사유 필수 — 사유와 함께 REJECTED 호출", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { withdrawalId: "w-1", status: "REJECTED" } });
    setup();
    fireEvent.click(screen.getByTestId("withdraw-reject-w-1"));
    // 사유 없이 제출 → 호출 없음.
    fireEvent.click(screen.getByTestId("withdraw-reject-submit-w-1"));
    expect(mockInvoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("withdraw-reject-memo-w-1"), { target: { value: "계좌 불일치" } });
    fireEvent.click(screen.getByTestId("withdraw-reject-submit-w-1"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("withdraw-process", {
        withdrawalId: "w-1",
        decision: "REJECTED",
        memo: "계좌 불일치",
      }),
    );
  });

  it("APPROVED 건에는 [지급 완료] 버튼 → PAID 호출", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { withdrawalId: "w-1", status: "PAID" } });
    setup({ withdrawals: [makeWithdrawal({ status: "APPROVED" })] });
    fireEvent.click(screen.getByTestId("withdraw-paid-w-1"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("withdraw-process", { withdrawalId: "w-1", decision: "PAID" }),
    );
  });
});

describe("SettlementPage — 수거 추이/라이더 실적/포인트 원장", () => {
  it("수거 추이에 현금/포인트 지급 분리 합계를 렌더한다", () => {
    setup({
      pickup: [
        { day: "2026-07-14", completedCount: 2, totalKg: 60, totalPaid: 43000, cashAmount: 22000, pointAmount: 21000, cashCount: 1, pointCount: 1 },
        { day: "2026-07-15", completedCount: 1, totalKg: 30, totalPaid: 21000, cashAmount: 21000, pointAmount: 0, cashCount: 1, pointCount: 0 },
      ],
    });
    expect(screen.getByTestId("pickup-total-count")).toHaveTextContent("3건");
    expect(screen.getByTestId("pickup-total-cash")).toHaveTextContent("43,000원");
    expect(screen.getByTestId("pickup-total-point")).toHaveTextContent("21,000P");
  });

  it("라이더별 지급 실적을 렌더한다(포인트 지급 = 정산 대상)", () => {
    setup({
      payouts: [
        { riderId: "r-1", riderName: "데모 라이더1", completedCount: 3, totalKg: 90, cashAmount: 40000, pointAmount: 21000 },
      ],
    });
    const table = screen.getByTestId("rider-payout-table");
    expect(table).toHaveTextContent("데모 라이더1");
    expect(table).toHaveTextContent("21,000P");
    expect(within(table).getByText("포인트 지급(정산 대상)")).toBeInTheDocument();
  });

  it("포인트 원장 감사에 entry_type 라벨과 부호를 렌더한다", () => {
    setup({
      ledger: [
        { id: 1, userId: "u-1", userName: "데모 기름집", entryType: "EARN", amount: 21000, orderId: "o-1", withdrawalId: null, memo: null, createdAt: new Date().toISOString() },
        { id: 2, userId: "u-1", userName: "데모 기름집", entryType: "WITHDRAW_REQUEST", amount: -10000, orderId: null, withdrawalId: "w-1", memo: null, createdAt: new Date().toISOString() },
      ],
    });
    const table = screen.getByTestId("point-ledger-audit-table");
    expect(table).toHaveTextContent("매각대금 적립");
    expect(table).toHaveTextContent("+21,000P");
    expect(table).toHaveTextContent("출금 신청");
    expect(table).toHaveTextContent("-10,000P");
  });
});

describe("SettlementPage — 쿠폰 UI 부재(08 P1)", () => {
  it("쿠폰 매출/결제/원장 섹션이 렌더되지 않는다", () => {
    setup();
    expect(screen.queryByTestId("coupon-sales-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-ledger-audit-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("purchase-list")).not.toBeInTheDocument();
    expect(screen.queryByText(/쿠폰/)).not.toBeInTheDocument();
  });
});

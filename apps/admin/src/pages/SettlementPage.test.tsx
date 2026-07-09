import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettlementPage } from "./SettlementPage";
import type { CouponLedgerAuditRow, CouponPurchaseRow, PickupStatsDailyRow } from "../hooks/useSalesAdmin";
import type { CouponSalesDailyRow } from "../lib/couponSales";

/**
 * SettlementPage "매출·정산" 재편(07 F10-③) 검증:
 * - ⓐ 쿠폰 매출 대시 렌더(판매/귀책 환급/PG 환불 구분) + 합계 = mock 뷰 데이터 합 일치
 * - ⓑ 수거 활동 추이 렌더(건수/kg/현금)
 * - ⓒ 쿠폰 원장 감사(entry_type 라벨, PG 환불 구분 배지)
 * - ⓓ 결제 목록 status 필터(EXPIRED 대사 안내 포함) + 환불 흐름(부분 qty·사유 필수·건당 1회 카피)
 * - ⓔ 구모델 출금 큐/포인트 원장 UI 부재
 */

const { mockInvoke, mockSales, mockPickup, mockLedger, mockPurchases } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockSales: vi.fn(),
  mockPickup: vi.fn(),
  mockLedger: vi.fn(),
  mockPurchases: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useSalesAdmin", () => ({
  useCouponSalesDaily: (days: number) => mockSales(days),
  usePickupStatsDaily: (days: number) => mockPickup(days),
  useCouponLedgerAudit: (limit: number) => mockLedger(limit),
  useCouponPurchases: (statusFilter: string) => mockPurchases(statusFilter),
}));

const SALES_ROWS: CouponSalesDailyRow[] = [
  { day: "2026-07-08", chargedQty: 40, salesAmount: 42000, refundQty: 0, pgRefundQty: 0, manualAdjustQty: 0 },
  { day: "2026-07-09", chargedQty: 10, salesAmount: 12000, refundQty: 2, pgRefundQty: 4, manualAdjustQty: 20 },
];

function purchase(overrides: Partial<CouponPurchaseRow> = {}): CouponPurchaseRow {
  return {
    id: "pu-1",
    riderId: "r-1",
    riderName: "김라이더",
    qty: 30,
    unitPrice: 1000,
    amount: 30000,
    status: "PAID",
    pgOrderId: "oc_abc",
    paymentKey: "pay_1",
    createdAt: "2026-07-09T00:00:00.000Z",
    paidAt: "2026-07-09T00:01:00.000Z",
    ...overrides,
  };
}

function setup({
  sales = SALES_ROWS,
  pickup = [] as PickupStatsDailyRow[],
  ledger = [] as CouponLedgerAuditRow[],
  purchases = [] as CouponPurchaseRow[],
} = {}) {
  mockSales.mockReturnValue({ data: sales, isLoading: false });
  mockPickup.mockReturnValue({ data: pickup, isLoading: false });
  mockLedger.mockReturnValue({ data: ledger, isLoading: false });
  mockPurchases.mockReturnValue({ data: purchases, isLoading: false, refetch: vi.fn() });
  return render(<SettlementPage />);
}

afterEach(() => {
  mockInvoke.mockReset();
  mockSales.mockReset();
  mockPickup.mockReset();
  mockLedger.mockReset();
  mockPurchases.mockReset();
});

describe("쿠폰 매출 대시 (ⓐ)", () => {
  it("일별 판매/귀책 환급/PG 환불을 구분해 렌더하고 합계가 mock 데이터 합과 일치한다", () => {
    setup();
    const table = within(screen.getByTestId("coupon-sales-table"));
    expect(table.getByText("2026-07-08")).toBeInTheDocument();
    expect(table.getByText("42,000원")).toBeInTheDocument();
    expect(table.getByText("12,000원")).toBeInTheDocument();

    // 합계 카드: 판매액 54,000 / 판매 50장 / 귀책 환급 2장 / PG 환불 4장.
    expect(screen.getByTestId("sales-total-amount")).toHaveTextContent("54,000원");
    expect(screen.getByTestId("sales-total-qty")).toHaveTextContent("50장");
    expect(screen.getByTestId("sales-total-refund")).toHaveTextContent("2장");
    expect(screen.getByTestId("sales-total-pg-refund")).toHaveTextContent("4장");
  });

  it("매출 데이터가 없으면 빈 상태 문구를 표시한다", () => {
    setup({ sales: [] });
    expect(screen.getByText("최근 14일 매출 데이터가 없어요.")).toBeInTheDocument();
  });
});

describe("수거 활동 추이 (ⓑ)", () => {
  it("일별 완료 건수/kg/현금 거래액을 렌더한다", () => {
    setup({
      pickup: [
        { day: "2026-07-08", completedCount: 5, totalKg: 120.5, totalCash: 108450 },
        { day: "2026-07-09", completedCount: 2, totalKg: 30, totalCash: 27000 },
      ],
    });
    const table = within(screen.getByTestId("pickup-stats-table"));
    expect(table.getByText("5건")).toBeInTheDocument();
    expect(table.getByText("120.5kg")).toBeInTheDocument();
    expect(table.getByText("108,450원")).toBeInTheDocument();
    expect(table.getByText("27,000원")).toBeInTheDocument();
  });
});

describe("쿠폰 원장 감사 (ⓒ)", () => {
  it("entry_type 한글 라벨과 PG 환불 구분 배지를 표시한다", () => {
    setup({
      ledger: [
        {
          id: 3,
          riderId: "r-1",
          riderName: "김라이더",
          entryType: "ADJUST",
          qty: -4,
          unitPrice: null,
          orderId: null,
          purchaseId: "pu-2",
          memo: "PG 환불 처리",
          createdAt: "2026-07-09T11:00:00.000Z",
        },
        {
          id: 2,
          riderId: "r-1",
          riderName: "김라이더",
          entryType: "CONSUME",
          qty: -2,
          unitPrice: null,
          orderId: "o-1",
          purchaseId: null,
          memo: null,
          createdAt: "2026-07-09T10:00:00.000Z",
        },
        {
          id: 1,
          riderId: "r-1",
          riderName: "김라이더",
          entryType: "CHARGE",
          qty: 30,
          unitPrice: 1000,
          orderId: null,
          purchaseId: "pu-1",
          memo: null,
          createdAt: "2026-07-08T09:00:00.000Z",
        },
      ],
    });
    const table = within(screen.getByTestId("coupon-ledger-audit-table"));
    expect(table.getByText("충전")).toBeInTheDocument();
    expect(table.getByText("콜 배정")).toBeInTheDocument();
    expect(table.getByText("PG 환불")).toBeInTheDocument(); // ADJUST + purchase_id 구분 배지
    expect(table.getByText("+30장")).toBeInTheDocument();
    expect(table.getByText("-2장")).toBeInTheDocument();
  });
});

describe("결제 목록 + 환불 (ⓓ)", () => {
  it("status 필터 클릭이 useCouponPurchases에 전달된다(EXPIRED 대사 포함)", () => {
    setup();
    expect(mockPurchases).toHaveBeenLastCalledWith("ALL");
    fireEvent.click(screen.getByTestId("purchase-filter-EXPIRED"));
    expect(mockPurchases).toHaveBeenLastCalledWith("EXPIRED");
    // EXPIRED 대사 안내 노출.
    expect(screen.getByTestId("expired-reconcile-note")).toHaveTextContent("승인 여부를 확인");
  });

  it("PAID 건에만 환불 버튼이 노출된다", () => {
    setup({
      purchases: [
        purchase({ id: "pu-paid", status: "PAID" }),
        purchase({ id: "pu-pending", status: "PENDING" }),
        purchase({ id: "pu-refunded", status: "REFUNDED" }),
      ],
    });
    expect(screen.getByTestId("refund-open-pu-paid")).toBeInTheDocument();
    expect(screen.queryByTestId("refund-open-pu-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("refund-open-pu-refunded")).not.toBeInTheDocument();
    // 상태 한글 라벨.
    expect(screen.getByTestId("purchase-row-pu-refunded")).toHaveTextContent("환불됨");
  });

  it("환불 폼: 사유 없이 제출하면 호출 없이 에러, 건당 1회 안내 카피가 보인다", async () => {
    setup({ purchases: [purchase()] });
    fireEvent.click(screen.getByTestId("refund-open-pu-1"));
    expect(screen.getByText(/구매 건당 1회/)).toBeInTheDocument();

    fireEvent.submit(screen.getByTestId("refund-submit-pu-1"));
    expect(await screen.findByText("환불 사유를 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("부분 qty 환불 시 coupon-refund 페이로드에 qty·reason을 담는다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { purchaseId: "pu-1", refundedQty: 10, balance: 20 } });
    setup({ purchases: [purchase()] });
    fireEvent.click(screen.getByTestId("refund-open-pu-1"));
    fireEvent.change(screen.getByTestId("refund-qty-pu-1"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("refund-reason-pu-1"), { target: { value: "라이더 요청" } });
    fireEvent.submit(screen.getByTestId("refund-submit-pu-1"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-refund", {
      purchaseId: "pu-1",
      qty: 10,
      reason: "라이더 요청",
    });
    expect(await screen.findByText(/쿠폰 10장이 환불되었어요/)).toBeInTheDocument();
  });

  it("qty를 비우면 전액 환불(qty 미포함 페이로드)로 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { purchaseId: "pu-1", refundedQty: 30, balance: 0 } });
    setup({ purchases: [purchase()] });
    fireEvent.click(screen.getByTestId("refund-open-pu-1"));
    fireEvent.change(screen.getByTestId("refund-reason-pu-1"), { target: { value: "전액 환불" } });
    fireEvent.submit(screen.getByTestId("refund-submit-pu-1"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-refund", { purchaseId: "pu-1", reason: "전액 환불" });
  });

  it("구매 qty를 초과하는 부분 환불은 호출 없이 거부한다", async () => {
    setup({ purchases: [purchase({ qty: 30 })] });
    fireEvent.click(screen.getByTestId("refund-open-pu-1"));
    fireEvent.change(screen.getByTestId("refund-qty-pu-1"), { target: { value: "31" } });
    fireEvent.change(screen.getByTestId("refund-reason-pu-1"), { target: { value: "초과" } });
    fireEvent.submit(screen.getByTestId("refund-submit-pu-1"));

    expect(await screen.findByText(/1~30장 사이의 정수/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("환불 실패(미사용 잔액 부족 등) 시 서버 메시지를 표시한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요." });
    setup({ purchases: [purchase()] });
    fireEvent.click(screen.getByTestId("refund-open-pu-1"));
    fireEvent.change(screen.getByTestId("refund-qty-pu-1"), { target: { value: "30" } });
    fireEvent.change(screen.getByTestId("refund-reason-pu-1"), { target: { value: "환불" } });
    fireEvent.submit(screen.getByTestId("refund-submit-pu-1"));

    expect(await screen.findByText(/수거쿠폰이 부족해요/)).toBeInTheDocument();
  });
});

describe("구모델 UI 제거 (ⓔ)", () => {
  it("출금 큐/포인트 원장 문자열이 더 이상 렌더되지 않는다", () => {
    setup();
    expect(screen.queryByText(/출금/)).not.toBeInTheDocument();
    expect(screen.queryByText(/포인트/)).not.toBeInTheDocument();
    expect(screen.getByText("매출·정산")).toBeInTheDocument();
  });
});

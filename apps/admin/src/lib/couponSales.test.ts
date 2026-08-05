import { describe, expect, it } from "vitest";
import {
  aggregateCouponSalesDaily,
  sumCouponSales,
  type CouponLedgerEntry,
} from "./couponSales";

/**
 * 07 F10 DoD #3 — 매출 수치 정합 테스트.
 * mock 쿠폰 원장 → 일별 집계(aggregateCouponSalesDaily = v_coupon_sales_daily의 TS 미러) →
 * 대시 합계(sumCouponSales)가 원장에서 직접 계산한 값과 일치해야 한다:
 *   판매액 = Σ CHARGE unit_price×qty, 환불은 §1-4 구분 집계
 *   (귀책 REFUND / PG 환불 = purchase_id 있는 ADJUST / 수동 조정 = purchase_id 없는 ADJUST).
 */

function entry(overrides: Partial<CouponLedgerEntry>): CouponLedgerEntry {
  return {
    entryType: "CHARGE",
    qty: 1,
    unitPrice: null,
    purchaseId: null,
    createdAt: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

const LEDGER: CouponLedgerEntry[] = [
  // 7/8: 단가 1,000원 30장 + 단가 1,200원 10장 충전, 5장 소진.
  entry({ entryType: "CHARGE", qty: 30, unitPrice: 1000, purchaseId: "p-1", createdAt: "2026-07-08T09:00:00.000Z" }),
  entry({ entryType: "CHARGE", qty: 10, unitPrice: 1200, purchaseId: "p-2", createdAt: "2026-07-08T15:00:00.000Z" }),
  entry({ entryType: "CONSUME", qty: -5, createdAt: "2026-07-08T18:00:00.000Z" }),
  // 7/9: 귀책 환급 2장(order 단위 REFUND), PG 환불 4장(purchase_id 있는 ADJUST -4),
  //      수동 조정 +20장(데모 선지급, purchase_id 없는 ADJUST).
  entry({ entryType: "REFUND", qty: 2, createdAt: "2026-07-09T10:00:00.000Z" }),
  entry({ entryType: "ADJUST", qty: -4, purchaseId: "p-2", createdAt: "2026-07-09T11:00:00.000Z" }),
  entry({ entryType: "ADJUST", qty: 20, createdAt: "2026-07-09T12:00:00.000Z" }),
];

describe("aggregateCouponSalesDaily (v_coupon_sales_daily 미러)", () => {
  it("일별로 판매/귀책 환급/PG 환불/수동 조정을 구분 집계한다", () => {
    const rows = aggregateCouponSalesDaily(LEDGER);
    expect(rows).toEqual([
      {
        day: "2026-07-08",
        chargedQty: 40,
        salesAmount: 30 * 1000 + 10 * 1200, // 42,000원
        refundQty: 0,
        pgRefundQty: 0,
        manualAdjustQty: 0,
      },
      {
        day: "2026-07-09",
        chargedQty: 0,
        salesAmount: 0,
        refundQty: 2,
        pgRefundQty: 4, // -qty 부호 반전(환불 장수는 양수로 표기)
        manualAdjustQty: 20,
      },
    ]);
  });

  it("CONSUME은 매출 집계에 포함되지 않는다(매출≠소진)", () => {
    const rows = aggregateCouponSalesDaily([entry({ entryType: "CONSUME", qty: -3 })]);
    expect(rows).toEqual([
      { day: "2026-07-09", chargedQty: 0, salesAmount: 0, refundQty: 0, pgRefundQty: 0, manualAdjustQty: 0 },
    ]);
  });
});

describe("매출 수치 정합 (DoD #3)", () => {
  it("대시 합계 = 원장 CHARGE 합 − 환불(구분 집계)과 일치한다", () => {
    const totals = sumCouponSales(aggregateCouponSalesDaily(LEDGER));

    // 원장에서 직접 계산한 기준값.
    const chargeQtyFromLedger = LEDGER.filter((e) => e.entryType === "CHARGE").reduce((s, e) => s + e.qty, 0);
    const salesFromLedger = LEDGER.filter((e) => e.entryType === "CHARGE").reduce(
      (s, e) => s + (e.unitPrice ?? 0) * e.qty,
      0,
    );
    const faultRefundFromLedger = LEDGER.filter((e) => e.entryType === "REFUND").reduce((s, e) => s + e.qty, 0);
    const pgRefundFromLedger = LEDGER.filter((e) => e.entryType === "ADJUST" && e.purchaseId !== null).reduce(
      (s, e) => s + -e.qty,
      0,
    );

    expect(totals.chargedQty).toBe(chargeQtyFromLedger); // 40장
    expect(totals.salesAmount).toBe(salesFromLedger); // 42,000원
    expect(totals.refundQty).toBe(faultRefundFromLedger); // 2장 (귀책)
    expect(totals.pgRefundQty).toBe(pgRefundFromLedger); // 4장 (PG)
    // 순 판매 장수(판매 − PG 환불)도 원장 기준과 일치.
    expect(totals.chargedQty - totals.pgRefundQty).toBe(36);
  });
});

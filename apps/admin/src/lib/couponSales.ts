// 쿠폰 매출 집계 유틸 (07 F10-③ⓐ 원형 — [17 Q4] 수거쿠폰 복권으로 a4b4fdd^에서 복원).
//
// 판매 통계는 DB 뷰 v_coupon_sales_daily(security_invoker + is_admin 게이트)를 단일 진실로 조회한다.
// 이 파일은 ⑴ 뷰가 반환하는 일별 행을 화면 합계로 접는 sumCouponSales와 ⑵ 그 뷰의 SQL 집계를
// TS로 미러링한 aggregateCouponSalesDaily를 제공한다. ⑵는 "원장 → 대시 합계" 정합성 테스트의
// 기준 구현으로, 뷰가 원장에서 무엇을 계산하는지 코드로 문서화한다.
//
// v_coupon_sales_daily 집계 규칙(01-db-schema.sql v_coupon_sales_daily 미러):
//   charged_qty       = Σ qty            where CHARGE
//   sales_amount(원)   = Σ unit_price*qty  where CHARGE
//   refund_qty        = Σ qty            where REFUND                       (귀책 환급, order 단위)
//   pg_refund_qty     = Σ (-qty)         where ADJUST and purchase_id != NULL (PG 환불)
//   manual_adjust_qty = Σ qty            where ADJUST and purchase_id == NULL (수동 조정 ±)

export type CouponEntryType = "CHARGE" | "CONSUME" | "REFUND" | "ADJUST";

/** coupon_ledger entry_type 한글 라벨(rider LedgerList variant="coupon"과 동일 카피). */
export const COUPON_ENTRY_LABEL: Record<string, string> = {
  CHARGE: "충전",
  CONSUME: "콜 배정",
  REFUND: "환급",
  ADJUST: "조정",
};

/** 원장 한 행(집계 입력). qty 부호: +충전/환급, -소진, ADJUST ±. */
export interface CouponLedgerEntry {
  entryType: CouponEntryType;
  qty: number;
  unitPrice: number | null;
  purchaseId: string | null;
  createdAt: string; // ISO
}

/** 일별 쿠폰 매출 행(v_coupon_sales_daily와 동일 형태). */
export interface CouponSalesDailyRow {
  day: string; // YYYY-MM-DD
  chargedQty: number;
  salesAmount: number; // 원
  refundQty: number; // 귀책 환급(장)
  pgRefundQty: number; // PG 환불(장)
  manualAdjustQty: number; // 수동 조정(장, ±)
}

/** 일별 매출 행들의 총합(대시 합계 푸터). */
export interface CouponSalesTotals {
  chargedQty: number;
  salesAmount: number;
  refundQty: number;
  pgRefundQty: number;
  manualAdjustQty: number;
}

/** v_coupon_sales_daily의 SQL 집계를 TS로 미러링(정합성 테스트 기준 구현). day = created_at 날짜. */
export function aggregateCouponSalesDaily(entries: CouponLedgerEntry[]): CouponSalesDailyRow[] {
  const byDay = new Map<string, CouponSalesDailyRow>();
  for (const e of entries) {
    const day = e.createdAt.slice(0, 10);
    const row =
      byDay.get(day) ??
      { day, chargedQty: 0, salesAmount: 0, refundQty: 0, pgRefundQty: 0, manualAdjustQty: 0 };
    if (e.entryType === "CHARGE") {
      row.chargedQty += e.qty;
      row.salesAmount += (e.unitPrice ?? 0) * e.qty;
    } else if (e.entryType === "REFUND") {
      row.refundQty += e.qty;
    } else if (e.entryType === "ADJUST") {
      if (e.purchaseId !== null) row.pgRefundQty += -e.qty;
      else row.manualAdjustQty += e.qty;
    }
    byDay.set(day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** 일별 매출 행들을 총합으로 접는다(화면 합계 푸터 + 정합성 테스트). */
export function sumCouponSales(rows: CouponSalesDailyRow[]): CouponSalesTotals {
  return rows.reduce<CouponSalesTotals>(
    (acc, r) => ({
      chargedQty: acc.chargedQty + r.chargedQty,
      salesAmount: acc.salesAmount + r.salesAmount,
      refundQty: acc.refundQty + r.refundQty,
      pgRefundQty: acc.pgRefundQty + r.pgRefundQty,
      manualAdjustQty: acc.manualAdjustQty + r.manualAdjustQty,
    }),
    { chargedQty: 0, salesAmount: 0, refundQty: 0, pgRefundQty: 0, manualAdjustQty: 0 },
  );
}

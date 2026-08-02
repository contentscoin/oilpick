// [16 L7] 좌상 정산 청구 상세 CSV — admin(DealerSettlementPage)·dealer(DealerStatementPage) 공용.
// 예전엔 admin 페이지 로컬 함수라 좌상이 매 청구마다 본사에 명세를 요청해야 했다(16 §5-2).
// 컬럼은 v_dealer_settlement_orders **실컬럼 그대로**(L-D6 — kg 없음, 뷰 변경 금지):
// cash_paid_amount(폐유 총액 gross 동결, 14 §10-5)와 net_amount(실지급 순액)를 구분 표기해
// gross/net 드리프트를 재도입하지 않는다. 생성(순수)과 다운로드(DOM)는 lib/csv 관례로 분리.

import type { PayoutMethod } from "@oilpick/core";
import { toCsv, downloadCsv } from "./csv";
import { supabase } from "./supabaseClient";

export interface SettlementOrderRow {
  order_id: string;
  payout_method: PayoutMethod | null;
  /** 폐유 총액(gross) 동결값 — 실지급액이 아니다(14 §10-5). */
  cash_paid_amount: number | null;
  purchase_amount: number | null;
  /** 상계 순액 — 정산 수식의 실제 기준. */
  net_amount: number | null;
  completed_at: string | null;
}

export const SETTLEMENT_CSV_HEADERS = [
  "order_id",
  "payout_method",
  "waste_amount", // = cash_paid_amount(폐유 총액 동결) — 기존 admin CSV 컬럼명 유지(하위호환)
  "purchase_amount",
  "net_amount",
  "completed_at",
];

/** 순수 직렬화 — 단위 테스트 대상(다운로드와 분리, lib/csv 관례). */
export function settlementOrdersToCsv(rows: SettlementOrderRow[]): string {
  return toCsv(
    SETTLEMENT_CSV_HEADERS,
    rows.map((r) => [
      r.order_id,
      r.payout_method ?? "",
      r.cash_paid_amount ?? 0,
      r.purchase_amount ?? 0,
      r.net_amount ?? 0,
      r.completed_at ?? "",
    ]),
  );
}

/**
 * 청구 1건의 근거 주문 CSV 다운로드. v_dealer_settlement_orders는 security_invoker + 스냅샷
 * RLS라 dealer는 본인 청구만, admin은 전체가 조회된다(서버 변경 0). 실패 시 false.
 */
export async function downloadSettlementCsv(settlementId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("v_dealer_settlement_orders")
    .select("order_id, payout_method, cash_paid_amount, purchase_amount, net_amount, completed_at")
    .eq("dealer_settlement_id", settlementId)
    .order("completed_at", { ascending: true });
  if (error || !data) return false;
  downloadCsv(`dealer-settlement-${settlementId.slice(0, 8)}`, settlementOrdersToCsv(data as SettlementOrderRow[]));
  return true;
}

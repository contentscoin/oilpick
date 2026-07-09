import { useQuery } from "@tanstack/react-query";
import type { OrderStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * 07 F8 — 점주의 현장 현금 수령(cash_paid_amount) 집계·이력.
 * 구모델 포인트 지갑(usePointBalance/useLedger)을 대체한다(07 D1 — 포인트 적립·출금 폐기).
 * 완료 시각은 07 F2-⑤ 레거시 규약 `coalesce(completed_at, delivered_at, picked_up_at)`을 따른다.
 * PostgREST에서 coalesce 범위 필터가 어려워 최근 N건을 받아 클라이언트에서 이번 달로 필터·합산한다
 * (rider useMonthlyPickupStats와 동일 규약 — 점주 월 완료량 규모상 충분).
 */

/** 현금 수령 집계·이력에서 완료로 간주하는 상태(신모델 COMPLETED + 레거시 DELIVERED). */
const RECEIPT_STATUSES: OrderStatus[] = ["COMPLETED", "DELIVERED"];

/** 이번 달 1일 0시(로컬) epoch ms. */
function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export interface MonthlyCashReceipt {
  /** 이번 달 현금 수령 건수(cash_paid_amount 기록된 완료 주문). */
  count: number;
  /** 이번 달 현금 수령 총액(원) — cash_paid_amount 합. 레거시(현금 없음)는 0 기여. */
  cash: number;
}

/**
 * U3 홈 "이번 달 수령 ₩N" 요약 카드(07 F8-③). 본인 완료 주문의 이번 달 cash_paid_amount 합.
 */
export function useMonthlyCashReceipt(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.monthlyCashReceipt(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MonthlyCashReceipt> => {
      if (!userId) return { count: 0, cash: 0 };
      const from = monthStart();

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("cash_paid_amount, completed_at, delivered_at, picked_up_at")
        .eq("supplier_id", userId)
        .in("status", RECEIPT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      let count = 0;
      let cash = 0;
      for (const row of data ?? []) {
        const receivedAt = row.completed_at ?? row.delivered_at ?? row.picked_up_at;
        if (!receivedAt || new Date(receivedAt).getTime() < from) continue;
        if (row.cash_paid_amount == null) continue;
        count += 1;
        cash += row.cash_paid_amount;
      }
      return { count, cash };
    },
  });
}

export interface CashReceipt {
  id: string;
  /** 현장 수령 현금(원) — cash_paid_amount. */
  amount: number;
  /** 확정(중재 반영) 무게(kg). */
  finalKg: number | null;
  /** 수령 시각 — coalesce(completed_at, delivered_at, picked_up_at). */
  receivedAt: string;
}

const RECEIPTS_LIMIT = 100;

/**
 * U11 "수령 이력" 화면(07 F8-⑦). 주문별 현금 수령 리스트(날짜/kg/₩N).
 * cash_paid_amount가 기록된 완료 주문만 노출(레거시 DELIVERED는 현금 없음 → 자동 제외).
 */
export function useCashReceipts(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cashReceipts(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<CashReceipt[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, cash_paid_amount, final_kg, completed_at, delivered_at, picked_up_at")
        .eq("supplier_id", userId)
        .in("status", RECEIPT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(RECEIPTS_LIMIT);
      if (error) throw error;

      return (data ?? [])
        .filter((row) => row.cash_paid_amount != null)
        .map((row) => ({
          id: row.id,
          amount: row.cash_paid_amount as number,
          finalKg: row.final_kg,
          receivedAt: (row.completed_at ?? row.delivered_at ?? row.picked_up_at) as string,
        }));
    },
  });
}

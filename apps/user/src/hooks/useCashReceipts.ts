import { useQuery } from "@tanstack/react-query";
import type { OrderStatus, PayoutMethod } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * 점주의 수령(cash_paid_amount = 확정 지급액) 집계·이력.
 * [08 G5] payout_method('CASH'|'POINT')를 반영해 현금/포인트 수령을 분리 집계한다 —
 * cash_paid_amount는 두 수단 모두의 확정 지급액이고(1P=1원, 08 P3), payout_method가
 * null이면 레거시 주문이므로 CASH로 간주한다(coalesce — 08 P3).
 * 완료 시각은 07 F2-⑤ 레거시 규약 `coalesce(completed_at, delivered_at, picked_up_at)`을 따른다.
 * PostgREST에서 coalesce 범위 필터가 어려워 최근 N건을 받아 클라이언트에서 이번 달로 필터·합산한다
 * (rider useMonthlyPickupStats와 동일 규약 — 점주 월 완료량 규모상 충분).
 */

/** 수령 집계·이력에서 완료로 간주하는 상태(신모델 COMPLETED + 레거시 DELIVERED). */
const RECEIPT_STATUSES: OrderStatus[] = ["COMPLETED", "DELIVERED"];

/** 이번 달 1일 0시(로컬) epoch ms. */
function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export interface MonthlyCashReceipt {
  /** 이번 달 수령 건수(cash_paid_amount 기록된 완료 주문 — 현금+포인트). */
  count: number;
  /** 이번 달 현금 수령 총액(원) — payout_method CASH(또는 레거시 null) 합. */
  cash: number;
  /** 이번 달 포인트 적립 총액(P) — payout_method POINT 합(1P=1원). */
  point: number;
}

/**
 * U3 홈 "이번 달 수령" 요약 카드(08 G5-④ — 현금/포인트 분리). 본인 완료 주문의
 * 이번 달 cash_paid_amount 합을 payout_method별로 나눈다.
 */
export function useMonthlyCashReceipt(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.monthlyCashReceipt(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MonthlyCashReceipt> => {
      if (!userId) return { count: 0, cash: 0, point: 0 };
      const from = monthStart();

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("cash_paid_amount, payout_method, completed_at, delivered_at, picked_up_at")
        .eq("supplier_id", userId)
        .in("status", RECEIPT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      let count = 0;
      let cash = 0;
      let point = 0;
      for (const row of data ?? []) {
        const receivedAt = row.completed_at ?? row.delivered_at ?? row.picked_up_at;
        if (!receivedAt || new Date(receivedAt).getTime() < from) continue;
        if (row.cash_paid_amount == null) continue;
        count += 1;
        // payout_method null = 레거시 → CASH 간주(08 P3 coalesce).
        if (row.payout_method === "POINT") {
          point += row.cash_paid_amount;
        } else {
          cash += row.cash_paid_amount;
        }
      }
      return { count, cash, point };
    },
  });
}

export interface CashReceipt {
  id: string;
  /** 확정 지급액 — cash_paid_amount(CASH=원, POINT=P. 1P=1원). */
  amount: number;
  /** 지급수단. null=레거시(CASH 간주 — 08 P3). */
  payoutMethod: PayoutMethod | null;
  /** 확정(중재 반영) 무게(kg). */
  finalKg: number | null;
  /** 수령 시각 — coalesce(completed_at, delivered_at, picked_up_at). */
  receivedAt: string;
}

const RECEIPTS_LIMIT = 100;

/**
 * U11 지갑 "수령 이력" 섹션(08 G5-①). 주문별 수령 리스트(날짜/kg/금액 + 현금/포인트 칩).
 * cash_paid_amount가 기록된 완료 주문만 노출(레거시 DELIVERED는 지급액 없음 → 자동 제외).
 */
export function useCashReceipts(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cashReceipts(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<CashReceipt[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, cash_paid_amount, payout_method, final_kg, completed_at, delivered_at, picked_up_at")
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
          payoutMethod: (row.payout_method ?? null) as PayoutMethod | null,
          finalKg: row.final_kg,
          receivedAt: (row.completed_at ?? row.delivered_at ?? row.picked_up_at) as string,
        }));
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface TodayStats {
  completedCount: number;
  /** 오늘 수거한 무게 합(kg) — COMPLETED 주문 final_kg(없으면 measured_kg). */
  collectedKg: number;
  /** 오늘 점주에게 지급한 현금 합(원) — cash_paid_amount. */
  cashPaid: number;
  /** 오늘 소진한 쿠폰 장수 — coupon_ledger CONSUME(음수 qty)의 절대합. */
  consumedCoupons: number;
}

/** 오늘 자정(로컬) 기준 ISO 문자열. */
function todayStartIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

/**
 * R2 콜 홈 "오늘 실적 요약"(07 F6-⑥). 신모델 현금 매입 기준으로 교체:
 * 오늘 완료(COMPLETED, completed_at 기준) 주문의 수거 kg / 지급 현금 + 오늘 소진 쿠폰.
 * 구모델의 point_ledger RELEASE 집계는 폐기(포인트 적립 모델 종료, 07 D1).
 */
export function useTodayStats(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.todayStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<TodayStats> => {
      if (!riderId) return { completedCount: 0, collectedKg: 0, cashPaid: 0, consumedCoupons: 0 };
      const start = todayStartIso();

      const { data: orders, error: ordersError } = await supabase
        .from("pickup_orders")
        .select("final_kg, measured_kg, cash_paid_amount")
        .eq("rider_id", riderId)
        .eq("status", "COMPLETED")
        .gte("completed_at", start);
      if (ordersError) throw ordersError;

      let collectedKg = 0;
      let cashPaid = 0;
      for (const row of orders ?? []) {
        collectedKg += row.final_kg ?? row.measured_kg ?? 0;
        cashPaid += row.cash_paid_amount ?? 0;
      }

      const { data: consumeRows, error: consumeError } = await supabase
        .from("coupon_ledger")
        .select("qty")
        .eq("rider_id", riderId)
        .eq("entry_type", "CONSUME")
        .gte("created_at", start);
      if (consumeError) throw consumeError;

      const consumedCoupons = (consumeRows ?? []).reduce((sum, row) => sum + Math.abs(row.qty), 0);

      return { completedCount: orders?.length ?? 0, collectedKg, cashPaid, consumedCoupons };
    },
  });
}

export interface MonthlyPickupStats {
  count: number;
  /** 이번 달 수거 무게 합(kg). */
  kg: number;
  /** 이번 달 점주 지급 현금 합(원) — 신모델 COMPLETED만 기여(레거시 cash 없음). */
  cash: number;
}

/** 이번 달 1일 0시(로컬) ISO. */
function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * R "수거 실적" 페이지(07 F6-⑤) 이번 달 집계. 본인의 완료 주문 건수/kg/현금 지급 총액.
 * 완료 시각은 07 F2-⑤ 레거시 규약 `coalesce(completed_at, delivered_at, picked_up_at)`을 따른다
 * — 신모델(COMPLETED)과 레거시(DELIVERED, 현금 없음)를 함께 집계한다.
 * PostgREST에서 coalesce 범위 필터가 어려워 최근 200건을 받아 클라이언트에서 이번 달로 필터·합산한다
 * (라이더 월 완료량 규모상 충분 — 정확한 무제한 집계가 필요해지면 날짜 범위 뷰로 교체).
 */
export function useMonthlyPickupStats(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.monthlyStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<MonthlyPickupStats> => {
      if (!riderId) return { count: 0, kg: 0, cash: 0 };
      const from = monthStart();

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("status, final_kg, measured_kg, cash_paid_amount, completed_at, delivered_at, picked_up_at")
        .eq("rider_id", riderId)
        .in("status", ["COMPLETED", "DELIVERED"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      let count = 0;
      let kg = 0;
      let cash = 0;
      for (const row of data ?? []) {
        const completedAt = row.completed_at ?? row.delivered_at ?? row.picked_up_at;
        if (!completedAt || new Date(completedAt).getTime() < from) continue;
        count += 1;
        kg += row.final_kg ?? row.measured_kg ?? 0;
        cash += row.cash_paid_amount ?? 0;
      }
      return { count, kg, cash };
    },
  });
}

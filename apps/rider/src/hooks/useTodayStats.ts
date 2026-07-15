import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface TodayStats {
  completedCount: number;
  /** 오늘 수거한 무게 합(kg) — COMPLETED 주문 final_kg(없으면 measured_kg). */
  collectedKg: number;
  /** 오늘 현금으로 지급한 금액 합(원) — coalesce(payout_method,'CASH')='CASH'인 cash_paid_amount. */
  cashPaid: number;
  /** 오늘 포인트로 지급한 금액 합(P) — payout_method='POINT'인 cash_paid_amount(1P=1원, 08 P3). */
  pointPaid: number;
}

/** 오늘 자정(로컬) 기준 ISO 문자열. */
function todayStartIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

/**
 * 완료 주문 1건의 지급을 수단별 합계에 반영한다(08 G6-④ 수단 분리 집계).
 * cash_paid_amount는 "확정 지급액"(CASH=현금, POINT=포인트 P, 1P=1원 — 08 P3).
 * payout_method null은 레거시 — CASH 간주(coalesce, 08 P3). 레거시 DELIVERED처럼
 * cash_paid_amount 자체가 없으면 어느 수단에도 기여하지 않는다.
 */
function addPayout(
  acc: { cash: number; point: number },
  row: { payout_method: string | null; cash_paid_amount: number | null },
): void {
  if (row.cash_paid_amount == null) return;
  if (row.payout_method === "POINT") acc.point += row.cash_paid_amount;
  else acc.cash += row.cash_paid_amount;
}

/**
 * R2 콜 홈 "오늘 실적 요약"(08 G6-④). 오늘 완료(COMPLETED, completed_at 기준) 주문의
 * 수거 kg / 현금 지급 / 포인트 지급. 쿠폰 소진 집계는 폐기(쿠폰 모델 폐기, 08 P1).
 */
export function useTodayStats(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.todayStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<TodayStats> => {
      if (!riderId) return { completedCount: 0, collectedKg: 0, cashPaid: 0, pointPaid: 0 };
      const start = todayStartIso();

      const { data: orders, error: ordersError } = await supabase
        .from("pickup_orders")
        .select("final_kg, measured_kg, payout_method, cash_paid_amount")
        .eq("rider_id", riderId)
        .eq("status", "COMPLETED")
        .gte("completed_at", start);
      if (ordersError) throw ordersError;

      let collectedKg = 0;
      const payout = { cash: 0, point: 0 };
      for (const row of orders ?? []) {
        collectedKg += row.final_kg ?? row.measured_kg ?? 0;
        addPayout(payout, row);
      }

      return {
        completedCount: orders?.length ?? 0,
        collectedKg,
        cashPaid: payout.cash,
        pointPaid: payout.point,
      };
    },
  });
}

export interface MonthlyPickupStats {
  count: number;
  /** 이번 달 수거 무게 합(kg). */
  kg: number;
  /** 이번 달 현금 지급 합(원) — coalesce(payout_method,'CASH')='CASH'. 레거시(DELIVERED)는 지급 없음. */
  cash: number;
  /** 이번 달 포인트 지급 합(P) — payout_method='POINT'(1P=1원, 08 P3). */
  point: number;
  /** 이번 달 현금 지급 완료 건수. */
  cashCount: number;
  /** 이번 달 포인트 지급 완료 건수. */
  pointCount: number;
}

/** 이번 달 1일 0시(로컬) ISO. */
function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * R "수거 실적" 페이지(08 G6-④) 이번 달 집계. 본인의 완료 주문 건수/kg + 현금/포인트 지급 분리.
 * 완료 시각은 07 F2-⑤ 레거시 규약 `coalesce(completed_at, delivered_at, picked_up_at)`을 따른다
 * — 신모델(COMPLETED)과 레거시(DELIVERED, 지급 없음)를 함께 집계한다.
 * PostgREST에서 coalesce 범위 필터가 어려워 최근 200건을 받아 클라이언트에서 이번 달로 필터·합산한다
 * (라이더 월 완료량 규모상 충분 — 정확한 무제한 집계가 필요해지면 날짜 범위 뷰로 교체).
 */
export function useMonthlyPickupStats(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.monthlyStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<MonthlyPickupStats> => {
      if (!riderId) return { count: 0, kg: 0, cash: 0, point: 0, cashCount: 0, pointCount: 0 };
      const from = monthStart();

      const { data, error } = await supabase
        .from("pickup_orders")
        .select(
          "status, final_kg, measured_kg, payout_method, cash_paid_amount, completed_at, delivered_at, picked_up_at",
        )
        .eq("rider_id", riderId)
        .in("status", ["COMPLETED", "DELIVERED"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      let count = 0;
      let kg = 0;
      let cashCount = 0;
      let pointCount = 0;
      const payout = { cash: 0, point: 0 };
      for (const row of data ?? []) {
        const completedAt = row.completed_at ?? row.delivered_at ?? row.picked_up_at;
        if (!completedAt || new Date(completedAt).getTime() < from) continue;
        count += 1;
        kg += row.final_kg ?? row.measured_kg ?? 0;
        if (row.cash_paid_amount != null) {
          if (row.payout_method === "POINT") pointCount += 1;
          else cashCount += 1;
        }
        addPayout(payout, row);
      }
      return { count, kg, cash: payout.cash, point: payout.point, cashCount, pointCount };
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface TodayStats {
  completedCount: number;
  earnedPoint: number;
}

/** 오늘 자정(로컬) 기준 ISO 문자열. */
function todayStartIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

/**
 * R2 콜 홈 "오늘 실적 요약". 오늘 배송완료(COMPLETED)한 주문 수 + point_ledger RELEASE 합계(P).
 * RELEASE는 00-domain.md "포인트 원장 규칙": "DELIVERED: RELEASE 행 추가 → held에서 빠지고
 * available로 이동" — 라이더 관점 오늘 확정 지급액을 의미한다.
 */
export function useTodayStats(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.todayStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<TodayStats> => {
      if (!riderId) return { completedCount: 0, earnedPoint: 0 };
      const start = todayStartIso();

      const { count: completedCount, error: completedError } = await supabase
        .from("pickup_orders")
        .select("id", { count: "exact", head: true })
        .eq("rider_id", riderId)
        .eq("status", "COMPLETED")
        .gte("created_at", start);
      if (completedError) throw completedError;

      const { data: ledgerRows, error: ledgerError } = await supabase
        .from("point_ledger")
        .select("amount")
        .eq("user_id", riderId)
        .eq("entry_type", "RELEASE")
        .gte("created_at", start);
      if (ledgerError) throw ledgerError;

      const earnedPoint = (ledgerRows ?? []).reduce((sum, row) => sum + row.amount, 0);

      return { completedCount: completedCount ?? 0, earnedPoint };
    },
  });
}

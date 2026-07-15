import { useQuery } from "@tanstack/react-query";
import type { OrderStatus, PayoutMethod } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface RunHistoryItem {
  id: string;
  status: OrderStatus;
  pickupAddress: string;
  requestedKg: number;
  finalKg: number | null;
  /** 확정 지급액(원). POINT 지급도 이 컬럼(1P=1원, 08 P3). 취소/레거시 주문 null. */
  cashPaidAmount: number | null;
  /** 현장 지급수단(08 P2). 레거시·계량 전 취소 주문 null(완료 표시는 CASH 간주). */
  payoutMethod: PayoutMethod | null;
  /** 소진 쿠폰 장수(coupon_cost). 쿠폰 모델 폐기(08 P1) 후 레거시 주문 표시 전용 — 신규 주문 null. */
  couponCost: number | null;
  createdAt: string;
}

export const RUN_HISTORY_PAGE_SIZE = 10;

/** "/history"가 취급하는 종료 상태(06 E9) — 본인 배정 주문 중 완료/취소만. */
export const RUN_HISTORY_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

/**
 * 06 E9 "/history" 운행 이력. apps/user useOrderHistory.ts의 페이지네이션 패턴 미러
 * (PAGE_SIZE 10, 다음 페이지 존재 확인용 +1건 조회) — 필터만 rider_id 본인 + 종료 상태로 교체.
 * ⚠️ snapshot_rider_fee(구모델 수거비)는 조회·표시 금지(07 D1) — select에 포함하지 않는다.
 */
export function useRunHistory(riderId: string | undefined, page: number) {
  return useQuery({
    queryKey: queryKeys.runHistory(riderId ?? "", page),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<{ items: RunHistoryItem[]; hasNextPage: boolean }> => {
      if (!riderId) return { items: [], hasNextPage: false };
      const from = page * RUN_HISTORY_PAGE_SIZE;
      const to = from + RUN_HISTORY_PAGE_SIZE; // 다음 페이지 존재 여부 확인을 위해 1건 더 조회

      const { data, error } = await supabase
        .from("pickup_orders")
        .select(
          "id, status, pickup_address, requested_kg, final_kg, payout_method, cash_paid_amount, coupon_cost, created_at",
        )
        .eq("rider_id", riderId)
        .in("status", RUN_HISTORY_STATUSES)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const rows = data ?? [];
      const hasNextPage = rows.length > RUN_HISTORY_PAGE_SIZE;
      const items = rows.slice(0, RUN_HISTORY_PAGE_SIZE).map((row) => ({
        id: row.id,
        status: row.status,
        pickupAddress: row.pickup_address,
        requestedKg: row.requested_kg,
        finalKg: row.final_kg,
        cashPaidAmount: row.cash_paid_amount,
        payoutMethod: row.payout_method ?? null,
        couponCost: row.coupon_cost,
        createdAt: row.created_at,
      }));
      return { items, hasNextPage };
    },
  });
}

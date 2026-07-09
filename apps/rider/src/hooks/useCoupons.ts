import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/** 결제 화면이 필요로 하는 최소 구매 건 필드(PENDING 대사·재시도용). */
export interface PendingPurchase {
  id: string;
  qty: number;
  unitPrice: number;
  amount: number;
  pgOrderId: string;
  createdAt: string;
}

/**
 * 최신 쿠폰 단가(coupon_price_ticks 종가). 07 F4 결제 화면 "예상 금액=단가×수량" 표시용.
 * 단가 미설정(빈 결과)이면 undefined — 화면이 결제 비활성 + 안내로 폴백한다. intent Edge가
 * 최종 진실(스냅샷)이며 이 훅은 UI 표시용 조회다.
 */
export function useCouponPrice() {
  return useQuery({
    queryKey: queryKeys.couponPrice(),
    queryFn: async (): Promise<number | undefined> => {
      const { data, error } = await supabase
        .from("coupon_price_ticks")
        .select("unit_price")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.unit_price ?? undefined;
    },
  });
}

/**
 * 본인 PENDING 구매 건 목록(07 §1-4 orphan 대사). 결제 화면 재진입 시 노출 + [결제 확인 재시도].
 * RLS(p_coupon_purchase_read: rider 본인)로 본인 것만 조회된다.
 */
export function usePendingPurchases(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pendingPurchases(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<PendingPurchase[]> => {
      if (!riderId) return [];
      const { data, error } = await supabase
        .from("coupon_purchases")
        .select("id, qty, unit_price, amount, pg_order_id, created_at")
        .eq("rider_id", riderId)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        qty: row.qty,
        unitPrice: row.unit_price,
        amount: row.amount,
        pgOrderId: row.pg_order_id,
        createdAt: row.created_at,
      }));
    },
  });
}

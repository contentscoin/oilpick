import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CouponLedgerEntryType, LedgerEntry } from "@oilpick/ui";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

// [17 Q3] 수거쿠폰 복권 — 08 G6-①이 삭제했던 훅을 a4b4fdd^ 원형에서 복원(07 F4/F5).
// 원장 쓰기는 전부 Edge Function/RPC 소관(절대 규칙 1) — 이 파일은 조회 + Realtime invalidate만.

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
 * 단가 미설정(빈 결과)이면 null — 화면이 결제 비활성 + 안내로 폴백한다(TanStack v5는 queryFn의
 * undefined 반환을 에러로 취급하므로 원형의 undefined 대신 null로 개정). intent Edge가
 * 최종 진실(스냅샷)이며 이 훅은 UI 표시용 조회다.
 */
export function useCouponPrice() {
  return useQuery({
    queryKey: queryKeys.couponPrice(),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("coupon_price_ticks")
        .select("unit_price")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.unit_price ?? null;
    },
  });
}

/**
 * R 콜 홈 쿠폰 잔액 카드(07 F5-①). v_coupon_balance 조회 + coupon_ledger INSERT Realtime 구독.
 * usePointBalance 패턴 미러 — CHARGE/CONSUME/REFUND/ADJUST insert 시 잔액·내역 쿼리를 무효화해
 * 폴링 없이 반영한다(publication은 20260709000006 — 08에서도 보존, 17 Q2 확인). 잔액 뷰는
 * 원장 없으면 행이 없어 balance 0으로 폴백(v_coupon_balance = group by rider_id).
 */
export function useCouponBalance(riderId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.couponBalance(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<number> => {
      if (!riderId) return 0;
      const { data, error } = await supabase
        .from("v_coupon_balance")
        .select("balance")
        .eq("rider_id", riderId)
        .maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },
  });

  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`coupon_ledger_self_${riderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coupon_ledger", filter: `rider_id=eq.${riderId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.couponBalance(riderId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.couponLedger(riderId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [riderId, queryClient]);

  return query;
}

/**
 * R 쿠폰 내역 화면(07 F5-③) 데이터. coupon_ledger 본인 행(RLS p_coupon_ledger_read)을
 * LedgerEntry[]로 매핑 — LedgerList variant="coupon"이 CHARGE/CONSUME/REFUND/ADJUST 라벨 +
 * 장 단위로 렌더한다. qty(부호 있는 장수)를 amount 필드로 넘긴다.
 */
export function useCouponLedger(riderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.couponLedger(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<LedgerEntry[]> => {
      if (!riderId) return [];
      const { data, error } = await supabase
        .from("coupon_ledger")
        .select("id, entry_type, qty, memo, created_at")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        entryType: row.entry_type as CouponLedgerEntryType,
        amount: row.qty,
        createdAt: row.created_at,
        memo: row.memo ?? undefined,
      }));
    },
  });
}

/**
 * 본인 PENDING 구매 건 목록(07 §1-4 orphan 대사). 결제 화면 재진입 시 노출 + [결제 확인 재시도].
 * RLS(p_coupon_purchase_read: rider 본인)로 본인 것만 조회된다. 24h TTL 초과분은 서버 대사가
 * EXPIRED로 전환한다(17 리스크 레지스터 — 화면은 PENDING만 다룬다).
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

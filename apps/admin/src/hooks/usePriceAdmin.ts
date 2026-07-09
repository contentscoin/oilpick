import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface PriceTickRow {
  id: number;
  pricePerKg: number;
  /** 레거시 수거비(07 §1-3 소멸). 신규 tick은 null — 이력 테이블 레거시 열 표시용으로만 조회. */
  riderFee: number | null;
  effectiveAt: string;
}

/** 03-frontend.md apps/admin "/price": "현재값 + price-set 폼 + tick 이력 테이블 + 미니 차트". */
export function usePriceHistory(limit = 30) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.priceHistory(limit),
    queryFn: async (): Promise<PriceTickRow[]> => {
      const { data, error } = await supabase
        .from("price_ticks")
        .select("id, price_per_kg, rider_fee, effective_at")
        .order("effective_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        pricePerKg: row.price_per_kg,
        riderFee: row.rider_fee,
        effectiveAt: row.effective_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_price_ticks")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_ticks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin", "price"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface CouponPriceTickRow {
  id: number;
  unitPrice: number;
  effectiveAt: string;
}

/**
 * 쿠폰 단가 tick 이력(07 F10-①). coupon_price_ticks는 price_ticks 미러(전체 read, admin insert).
 * usePriceHistory와 동일 패턴 — coupon-price-set으로 새 tick 등록 시 Realtime로 무효화.
 */
export function useCouponPriceHistory(limit = 30) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.couponPriceHistory(limit),
    queryFn: async (): Promise<CouponPriceTickRow[]> => {
      const { data, error } = await supabase
        .from("coupon_price_ticks")
        .select("id, unit_price, effective_at")
        .order("effective_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        unitPrice: row.unit_price,
        effectiveAt: row.effective_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_coupon_price_ticks")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coupon_price_ticks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin", "price"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface PriceTickRow {
  id: number;
  pricePerKg: number;
  riderFee: number;
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

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FreshOilPriceTick } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

const FRESH_OIL_PRICE_KEY = ["freshOilPrice", "latest"] as const;

/**
 * [14 J2] 신유(새 식용유, 18L 1종) 최신 고시가 1건 + Realtime 구독.
 * fresh_oil_price_ticks가 비어 있으면(관리자가 아직 고시가 미설정) null → 신유 구매 UI를 숨긴다.
 * price_ticks 훅과 동일한 postgres_changes INSERT 구독 패턴.
 */
export function useFreshOilPrice() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: FRESH_OIL_PRICE_KEY,
    queryFn: async (): Promise<FreshOilPriceTick | null> => {
      const { data, error } = await supabase
        .from("fresh_oil_price_ticks")
        .select("id, price_per_can, effective_at")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, pricePerCan: data.price_per_can, effectiveAt: data.effective_at };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("fresh_oil_price_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fresh_oil_price_ticks" },
        () => {
          queryClient.invalidateQueries({ queryKey: FRESH_OIL_PRICE_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

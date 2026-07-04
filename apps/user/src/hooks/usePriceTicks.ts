import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface PriceTick {
  id: number;
  pricePerKg: number;
  riderFee: number;
  effectiveAt: string;
}

function mapRow(row: {
  id: number;
  price_per_kg: number;
  rider_fee: number;
  effective_at: string;
}): PriceTick {
  return {
    id: row.id,
    pricePerKg: row.price_per_kg,
    riderFee: row.rider_fee,
    effectiveAt: row.effective_at,
  };
}

const HISTORY_LIMIT = 30;

/**
 * price_ticks 최근 이력(최신순, 최대 30개) 조회 + Realtime 구독.
 * 03-frontend.md U3 "PriceCard(최신 tick, Realtime 구독)", U4 "이력 테이블(최근 30 tick)".
 * price_ticks는 20260704000009_realtime_price_ticks.sql에서 supabase_realtime publication에
 * 추가했다(U3/U4가 요구하는 Realtime 구독을 위한 스키마 보완, 04-tasks.md 참고).
 */
export function usePriceTicks(limit: number = HISTORY_LIMIT) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.priceTickHistory(limit);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PriceTick[]> => {
      const { data, error } = await supabase
        .from("price_ticks")
        .select("id, price_per_kg, rider_fee, effective_at")
        .order("effective_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });

  useEffect(() => {
    // 채널 이름은 limit별로 고유해야 한다 — HomePage가 usePriceTicks(30)(useLatestPriceTick 내부)와
    // usePriceTicks(10)을 동시에 호출하는 것처럼 이 훅이 같은 컴포넌트 트리에서 서로 다른 limit으로
    // 여러 번 쓰일 수 있는데, 고정 채널명("price_ticks_changes")을 쓰면 Supabase Realtime 클라이언트가
    // 동일 이름의 채널을 중복 subscribe하게 되어 충돌한다(실제로 화면이 렌더되지 않는 크래시로 재현됨).
    const channel = supabase
      .channel(`price_ticks_changes_${limit}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_ticks" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.latestPriceTick() });
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey는 limit에서 파생된 값이라 별도 의존성으로 나열하지 않는다(limit 변경 시에만
    // 재구독). MapView.tsx와 동일하게 이 워크스페이스는 eslint-plugin-react-hooks를 쓰지 않는다.
  }, [limit]);

  return query;
}

/** 최신 시세 1건 (홈 화면 PriceCard 전용, history의 첫 행과 동일 데이터를 별도 캐시 키로 노출). */
export function useLatestPriceTick() {
  const { data, ...rest } = usePriceTicks(30);
  return { ...rest, data: data?.[0] };
}

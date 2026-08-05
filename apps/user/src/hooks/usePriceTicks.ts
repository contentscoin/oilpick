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

/** 일별 차트 기간 세그먼트(07 F7 §1-5). 7/30/90일. */
export type PriceTicksSinceDays = 7 | 30 | 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 최근 `days`일 범위의 price_ticks 조회(오름차순) + Realtime 구독.
 * 07-pivot-plan.md F7-③: `effective_at >= now()-interval` 범위 쿼리.
 * limit 방식(usePriceTicks)은 "30개 ≠ 30일"이라 일별 차트에 부적합 — resampleDaily(§1-5)와 짝을 이룬다.
 * (기존 usePriceTicks/useLatestPriceTick은 소비처 전환(F8) 전까지 보존한다.)
 *
 * 창 **직전 마지막 tick 1건을 함께 조회해 맨 앞에 붙인다** — 00-domain "tick 없는 날 =
 * 직전값 캐리포워드"의 시드다. 창 안 tick만 주면 resampleDaily가 창 선행일을 영원히 못
 * 메워서, 7일처럼 짧은 창에서 tick이 드문 날엔 점이 2개 미만 → 차트가 아예 사라졌다(확정 결함).
 */
export function usePriceTicksSince(days: PriceTicksSinceDays) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.priceTickSince(days);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PriceTick[]> => {
      const sinceIso = new Date(Date.now() - days * DAY_MS).toISOString();
      const [inWindow, seed] = await Promise.all([
        supabase
          .from("price_ticks")
          .select("id, price_per_kg, rider_fee, effective_at")
          .gte("effective_at", sinceIso)
          .order("effective_at", { ascending: true }),
        supabase
          .from("price_ticks")
          .select("id, price_per_kg, rider_fee, effective_at")
          .lt("effective_at", sinceIso)
          .order("effective_at", { ascending: false })
          .limit(1),
      ]);
      if (inWindow.error) throw inWindow.error;
      if (seed.error) throw seed.error;
      return [...(seed.data ?? []), ...(inWindow.data ?? [])].map(mapRow);
    },
  });

  useEffect(() => {
    // 채널명은 기간별로 고유해야 한다(usePriceTicks의 limit별 채널명 주석 참조 — 중복 subscribe 크래시 방지).
    const channel = supabase
      .channel(`price_ticks_since_${days}`)
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
    // queryKey는 days에서 파생 — days 변경 시에만 재구독(usePriceTicks와 동일 규약).
  }, [days]);

  return query;
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface ActiveOrderSummary {
  id: string;
  status: OrderStatus;
  requestedKg: number;
  snapshotPricePerKg: number;
  createdAt: string;
}

/** U3 홈 상단 고정 카드가 "진행중"으로 취급하는 상태 — 00-domain.md 상태머신에서
 * 최종/종료 상태(COMPLETED/CANCELLED)를 제외한 전부. */
const ACTIVE_STATUSES: OrderStatus[] = [
  "REQUESTED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "DELIVERED",
  "DISPUTED",
];

/**
 * 로그인한 supplier의 진행중 주문(최신 1건) 조회 + Realtime 구독.
 * 03-frontend.md U3: "진행중 주문 있으면 상단에 진행 카드 고정", "공통 규칙":
 * "pickup_orders 자기 행 UPDATE 구독으로 상태 자동 갱신(폴링 금지)".
 */
export function useActiveOrder(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.activeOrder(userId ?? "");

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActiveOrderSummary | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, status, requested_kg, snapshot_price_per_kg, created_at")
        .eq("supplier_id", userId)
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        requestedKg: data.requested_kg,
        snapshotPricePerKg: data.snapshot_price_per_kg,
        createdAt: data.created_at,
      };
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`pickup_orders_supplier_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_orders",
          filter: `supplier_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.activeOrder(userId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey는 userId에서 파생된 값이라 별도 의존성으로 나열하지 않는다 — queryKeys.activeOrder(...)가
    // 매 렌더 새 배열을 반환하므로 이를 그대로 deps에 넣으면 매 렌더 채널을 구독/해제하게 된다
    // (실제로 화면이 렌더되지 않는 크래시로 재현됨). usePriceTicks.ts와 동일 패턴.
  }, [userId, queryClient]);

  return query;
}

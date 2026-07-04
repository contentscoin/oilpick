import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface ActiveRun {
  id: string;
  status: OrderStatus;
  supplierId: string;
  depotId: string | null;
  pickupAddress: string;
  requestedKg: number;
  measuredKg: number | null;
  photoUrls: string[];
  snapshotPricePerKg: number;
  snapshotRiderFee: number;
  createdAt: string;
}

const RUN_COLUMNS =
  "id, status, supplier_id, depot_id, pickup_address, requested_kg, measured_kg, photo_urls, snapshot_price_per_kg, snapshot_rider_fee, created_at";

const RUN_STATUSES: OrderStatus[] = ["ACCEPTED", "ARRIVED", "PICKED_UP"];

function mapRow(row: {
  id: string;
  status: OrderStatus;
  supplier_id: string;
  depot_id: string | null;
  pickup_address: string;
  requested_kg: number;
  measured_kg: number | null;
  photo_urls: string[];
  snapshot_price_per_kg: number;
  snapshot_rider_fee: number;
  created_at: string;
}): ActiveRun {
  return {
    id: row.id,
    status: row.status,
    supplierId: row.supplier_id,
    depotId: row.depot_id,
    pickupAddress: row.pickup_address,
    requestedKg: row.requested_kg,
    measuredKg: row.measured_kg,
    photoUrls: row.photo_urls ?? [],
    snapshotPricePerKg: row.snapshot_price_per_kg,
    snapshotRiderFee: row.snapshot_rider_fee,
    createdAt: row.created_at,
  };
}

/**
 * R4~R6 "/active" 운행 단일 화면이 쓰는, 배정된 라이더 본인의 진행중(ACCEPTED~PICKED_UP)
 * 주문 1건 조회 + Realtime 구독(03-frontend.md apps/rider 표: "status 분기").
 */
export function useActiveRun(riderId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.activeRun(riderId ?? "");

  const query = useQuery({
    queryKey,
    enabled: Boolean(riderId),
    queryFn: async (): Promise<ActiveRun | null> => {
      if (!riderId) return null;
      const { data, error } = await supabase
        .from("pickup_orders")
        .select(RUN_COLUMNS)
        .eq("rider_id", riderId)
        .in("status", RUN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRow(data);
    },
  });

  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`pickup_orders_rider_${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_orders",
          filter: `rider_id=eq.${riderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.activeRun(riderId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKeys.activeRun(riderId)는 매 렌더 새 배열을 반환하므로 deps에는 riderId만 사용한다
    // (apps/user useActiveOrder.ts와 동일 패턴).
  }, [riderId, queryClient]);

  return query;
}

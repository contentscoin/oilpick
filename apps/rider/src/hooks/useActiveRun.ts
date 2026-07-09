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
  /** 확정(중재 반영) 무게. 07 §1-3: RESOLVE_DISPUTE가 기록하면 ARRIVED 복귀 + 재제출 불가 마킹. */
  finalKg: number | null;
  photoUrls: string[];
  snapshotPricePerKg: number;
  snapshotRiderFee: number;
  /** 소진 쿠폰 장수(coupon_cost). 레거시 주문 null. */
  couponCost: number | null;
  /** 완료 시 현장 지급 현금(원). COMPLETED에서만 채워짐. 07 F6-④ 완료 요약. */
  cashPaidAmount: number | null;
  completedAt: string | null;
  createdAt: string;
}

const RUN_COLUMNS =
  "id, status, supplier_id, depot_id, pickup_address, requested_kg, measured_kg, final_kg, photo_urls, snapshot_price_per_kg, snapshot_rider_fee, coupon_cost, cash_paid_amount, completed_at, created_at";

/**
 * 진행중으로 취급하는 상태(07 F6-②③④).
 * - DISPUTED: 분쟁 안내 패널을 위해 포함(예전엔 빠져 라이더가 빈 화면+수수께끼 409에 갇혔다).
 * - COMPLETED: "수거 완료 — 현금 지급" 요약 화면을 위해 포함하되, 최근 완료분만 노출한다
 *   (COMPLETED_SUMMARY_WINDOW_MS 경과분은 queryFn에서 null 처리 → EmptyState로 콜홈 유도).
 *   라이더 단일 활성주문 불변식(idx_rider_single_active_order) 덕에, 활성 주문이 있으면
 *   그 주문이 항상 created_at 최신이라 stale COMPLETED가 활성 주문을 가리지 않는다.
 */
const RUN_STATUSES: OrderStatus[] = ["ACCEPTED", "ARRIVED", "PICKED_UP", "DISPUTED", "COMPLETED"];

/** COMPLETED 요약을 "완료 직후"로 한정하는 창(07 F6-④, 스펙 미명시 — 보고). */
const COMPLETED_SUMMARY_WINDOW_MS = 30 * 60 * 1000;

function mapRow(row: {
  id: string;
  status: OrderStatus;
  supplier_id: string;
  depot_id: string | null;
  pickup_address: string;
  requested_kg: number;
  measured_kg: number | null;
  final_kg: number | null;
  photo_urls: string[];
  snapshot_price_per_kg: number;
  snapshot_rider_fee: number;
  coupon_cost: number | null;
  cash_paid_amount: number | null;
  completed_at: string | null;
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
    finalKg: row.final_kg,
    photoUrls: row.photo_urls ?? [],
    snapshotPricePerKg: row.snapshot_price_per_kg,
    snapshotRiderFee: row.snapshot_rider_fee,
    couponCost: row.coupon_cost ?? null,
    cashPaidAmount: row.cash_paid_amount ?? null,
    completedAt: row.completed_at,
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
      const run = mapRow(data);
      // 07 F6-④: 오래된 완료분은 활성 운행으로 취급하지 않는다(완료 직후 요약만 노출).
      if (run.status === "COMPLETED") {
        const completedMs = run.completedAt ? new Date(run.completedAt).getTime() : 0;
        if (!completedMs || Date.now() - completedMs > COMPLETED_SUMMARY_WINDOW_MS) return null;
      }
      return run;
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

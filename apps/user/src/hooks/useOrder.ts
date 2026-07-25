import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseGeographyPoint, type OrderStatus, type PayoutMethod } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface OrderDetail {
  id: string;
  status: OrderStatus;
  supplierId: string;
  riderId: string | null;
  depotId: string | null;
  requestedCans: number | null;
  requestedKg: number;
  pickupAddress: string;
  /** 수거지 좌표(pickup_location 파싱, 12 S3) — 지도 센터. 파싱 실패 시 null. */
  pickupLat: number | null;
  pickupLng: number | null;
  preferredTime: string | null;
  snapshotPricePerKg: number;
  snapshotRiderFee: number;
  measuredKg: number | null;
  finalKg: number | null;
  supplierPoint: number | null;
  couponCost: number | null;
  /** [08 P2] 현장 지급수단 — 라이더가 SUBMIT_MEASURE에서 선택. null=계량 제출 전 또는 레거시(CASH 간주). */
  payoutMethod: PayoutMethod | null;
  /** [14 J2] 폐유 총액(gross)으로 **동결**된 값 — 실지급액이 아니다. 화면 금액은 netAmount를 쓸 것. */
  cashPaidAmount: number | null;
  // [14 J2] 신유 구매·현장 상계. orderKind null=레거시=PICKUP.
  orderKind: "PICKUP" | "PURCHASE" | "MIXED" | null;
  purchaseRequestedCans: number | null;
  snapshotFreshCanPrice: number | null;
  deliveredCans: number | null;
  purchaseAmount: number | null;
  /** 상계 순액 = cashPaidAmount − purchaseAmount. 음수면 점주가 지불. 레거시는 null. */
  netAmount: number | null;
  photoUrls: string[];
  cancelReason: string | null;
  disputeReason: string | null;
  createdAt: string;
  acceptedAt: string | null;
  /** [14 J1] ARRIVE 전이 시각 — 타임라인 'ARRIVED' 노드 시각. */
  arrivedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
}

function mapRow(row: {
  id: string;
  status: OrderStatus;
  supplier_id: string;
  rider_id: string | null;
  depot_id: string | null;
  requested_cans: number | null;
  requested_kg: number;
  pickup_address: string;
  pickup_location: string | null;
  preferred_time: string | null;
  snapshot_price_per_kg: number;
  snapshot_rider_fee: number;
  measured_kg: number | null;
  final_kg: number | null;
  supplier_point: number | null;
  coupon_cost: number | null;
  payout_method: PayoutMethod | null;
  cash_paid_amount: number | null;
  order_kind: "PICKUP" | "PURCHASE" | "MIXED" | null;
  purchase_requested_cans: number | null;
  snapshot_fresh_can_price: number | null;
  delivered_cans: number | null;
  purchase_amount: number | null;
  net_amount: number | null;
  photo_urls: string[];
  cancel_reason: string | null;
  dispute_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
}): OrderDetail {
  const pickupPoint = parseGeographyPoint(row.pickup_location);
  return {
    id: row.id,
    status: row.status,
    supplierId: row.supplier_id,
    riderId: row.rider_id,
    depotId: row.depot_id,
    requestedCans: row.requested_cans,
    requestedKg: row.requested_kg,
    pickupAddress: row.pickup_address,
    pickupLat: pickupPoint?.lat ?? null,
    pickupLng: pickupPoint?.lng ?? null,
    preferredTime: row.preferred_time,
    snapshotPricePerKg: row.snapshot_price_per_kg,
    snapshotRiderFee: row.snapshot_rider_fee,
    measuredKg: row.measured_kg,
    finalKg: row.final_kg,
    supplierPoint: row.supplier_point,
    couponCost: row.coupon_cost,
    payoutMethod: row.payout_method,
    cashPaidAmount: row.cash_paid_amount,
    orderKind: row.order_kind ?? null,
    purchaseRequestedCans: row.purchase_requested_cans,
    snapshotFreshCanPrice: row.snapshot_fresh_can_price,
    deliveredCans: row.delivered_cans,
    purchaseAmount: row.purchase_amount,
    netAmount: row.net_amount,
    photoUrls: row.photo_urls ?? [],
    cancelReason: row.cancel_reason,
    disputeReason: row.dispute_reason,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    arrivedAt: row.arrived_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
  };
}

const ORDER_DETAIL_COLUMNS =
  "id, status, supplier_id, rider_id, depot_id, requested_cans, requested_kg, pickup_address, pickup_location, preferred_time, snapshot_price_per_kg, snapshot_rider_fee, measured_kg, final_kg, supplier_point, coupon_cost, payout_method, cash_paid_amount, order_kind, purchase_requested_cans, snapshot_fresh_can_price, delivered_cans, purchase_amount, net_amount, photo_urls, cancel_reason, dispute_reason, created_at, accepted_at, arrived_at, picked_up_at, delivered_at, completed_at";

/**
 * 단일 주문 상세 조회 + Realtime 구독. 03-frontend.md U6~U9 "/orders/:id":
 * "status로 분기 렌더" + 공통 규칙 "pickup_orders 자기 행 UPDATE 구독으로 상태 자동 갱신
 * (폴링 금지)". useActiveOrder.ts와 동일 패턴(테이블 전체를 구독하되 filter로 좁힘)이지만
 * 이 훅은 orderId 단건에 filter를 건다.
 */
export function useOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.orderDetail(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderDetail | null> => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("pickup_orders")
        .select(ORDER_DETAIL_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRow(data);
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`pickup_orders_detail_${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pickup_orders",
          filter: `id=eq.${orderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.orderDetail(orderId) });
          // 활성 주문 카드(useActiveOrder)도 같은 행을 보고 있으므로 함께 갱신.
          queryClient.invalidateQueries({ queryKey: ["orders", "active"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKeys.orderDetail(orderId)는 매 렌더 새 배열을 반환하므로 deps에 orderId만 사용한다
    // (usePriceTicks.ts/useActiveOrder.ts와 동일 패턴 — 그렇지 않으면 매 렌더 채널을 재구독한다).
  }, [orderId, queryClient]);

  return query;
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import type { OrderStatus } from "@oilpick/core";

/**
 * supplier_id/rider_id → store_name/vehicle_number 매핑. PostgREST의 임베드(join) 문법은
 * FK 제약 이름(예: pickup_orders_supplier_id_fkey)에 의존하는데 01-db-schema.sql은 인라인
 * `references`로 제약을 선언해 이름이 Postgres 기본 명명 규칙에 암묵적으로 의존한다 — 이를
 * 직접 가정하는 대신 profiles/supplier_profiles/rider_profiles를 별도 조회해 Map으로 join하는
 * 더 견고한 방식을 쓴다(admin은 is_admin() RLS로 두 테이블 모두 전체 read 가능, 01-db-schema.sql
 * p_sup_self/p_rider_self "id = auth.uid() or is_admin()").
 */
async function fetchNameMaps(): Promise<{
  supplierNames: Map<string, string>;
  riderNames: Map<string, string>;
}> {
  const [suppliersRes, ridersRes] = await Promise.all([
    supabase.from("supplier_profiles").select("id, store_name"),
    supabase.from("rider_profiles").select("id, vehicle_number"),
  ]);
  const supplierNames = new Map<string, string>(
    (suppliersRes.data ?? []).map((s) => [s.id as string, s.store_name as string]),
  );
  const riderNames = new Map<string, string>(
    (ridersRes.data ?? []).map((r) => [r.id as string, r.vehicle_number as string]),
  );
  return { supplierNames, riderNames };
}

export interface AdminOrderRow {
  id: string;
  status: OrderStatus;
  supplierId: string;
  supplierName: string;
  riderId: string | null;
  riderName: string | null;
  requestedKg: number;
  measuredKg: number | null;
  finalKg: number | null;
  pickupAddress: string;
  createdAt: string;
}

/** 03-frontend.md apps/admin "/orders": "테이블(상태 필터)". statusFilter가 "ALL"이면 전체. */
export function useAdminOrders(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.orders(statusFilter),
    queryFn: async (): Promise<AdminOrderRow[]> => {
      let q = supabase
        .from("pickup_orders")
        .select("id, status, supplier_id, rider_id, requested_kg, measured_kg, final_kg, pickup_address, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }
      const [{ data, error }, { supplierNames, riderNames }] = await Promise.all([q, fetchNameMaps()]);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        supplierId: row.supplier_id,
        supplierName: supplierNames.get(row.supplier_id) ?? row.supplier_id.slice(0, 8),
        riderId: row.rider_id,
        riderName: row.rider_id ? (riderNames.get(row.rider_id) ?? row.rider_id.slice(0, 8)) : null,
        requestedKg: Number(row.requested_kg),
        measuredKg: row.measured_kg !== null ? Number(row.measured_kg) : null,
        finalKg: row.final_kg !== null ? Number(row.final_kg) : null,
        pickupAddress: row.pickup_address,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_orders_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface AdminOrderEvent {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** 03-frontend.md apps/admin "/orders": "상세 드로어(이벤트 타임라인, 사진)". */
export function useAdminOrderEvents(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderEvents(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<AdminOrderEvent[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_events")
        .select("id, from_status, to_status, actor_id, payload, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        actorId: row.actor_id,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdAt: row.created_at,
      }));
    },
  });
}

export interface AdminOrderDetail extends AdminOrderRow {
  measuredKg: number | null;
  photoUrls: string[];
  disputeReason: string | null;
  cancelReason: string | null;
  snapshotPricePerKg: number;
  /** 07 F10-⑤: 소진 쿠폰 장수(주문 생성 시 스냅샷). 레거시 주문은 null. */
  couponCost: number | null;
  /** 07 F10-⑤: 완료 시 지급된 현금(round(final_kg×snapshot_price)). 미완료 null. */
  cashPaidAmount: number | null;
  completedAt: string | null;
  /** 07 F10-⑤: 이 주문에 대한 쿠폰 환급(REFUND 원장) 존재 여부. 귀책 취소 시 true. */
  refunded: boolean;
}

export function useAdminOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderDetail(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<AdminOrderDetail | null> => {
      if (!orderId) return null;
      const [{ data, error }, { supplierNames, riderNames }, refundRes] = await Promise.all([
        supabase
          .from("pickup_orders")
          .select(
            "id, status, supplier_id, rider_id, requested_kg, final_kg, measured_kg, photo_urls, dispute_reason, cancel_reason, pickup_address, created_at, snapshot_price_per_kg, coupon_cost, cash_paid_amount, completed_at",
          )
          .eq("id", orderId)
          .maybeSingle(),
        fetchNameMaps(),
        // 귀책 환급(REFUND) 여부 — coupon_ledger에서 이 주문의 REFUND 원장을 admin RLS로 조회.
        supabase
          .from("coupon_ledger")
          .select("id")
          .eq("order_id", orderId)
          .eq("entry_type", "REFUND")
          .limit(1),
      ]);
      if (error) throw error;
      if (refundRes.error) throw refundRes.error;
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        supplierId: data.supplier_id,
        supplierName: supplierNames.get(data.supplier_id) ?? data.supplier_id.slice(0, 8),
        riderId: data.rider_id,
        riderName: data.rider_id ? (riderNames.get(data.rider_id) ?? data.rider_id.slice(0, 8)) : null,
        requestedKg: Number(data.requested_kg),
        finalKg: data.final_kg !== null ? Number(data.final_kg) : null,
        measuredKg: data.measured_kg !== null ? Number(data.measured_kg) : null,
        photoUrls: data.photo_urls ?? [],
        disputeReason: data.dispute_reason,
        cancelReason: data.cancel_reason,
        pickupAddress: data.pickup_address,
        createdAt: data.created_at,
        snapshotPricePerKg: data.snapshot_price_per_kg,
        couponCost: data.coupon_cost !== null && data.coupon_cost !== undefined ? Number(data.coupon_cost) : null,
        cashPaidAmount:
          data.cash_paid_amount !== null && data.cash_paid_amount !== undefined ? Number(data.cash_paid_amount) : null,
        completedAt: data.completed_at ?? null,
        refunded: (refundRes.data ?? []).length > 0,
      };
    },
  });
}

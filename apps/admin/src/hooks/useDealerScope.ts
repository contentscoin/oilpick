import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dealerRiderStatsSchema, type DealerRiderStats, type OrderKind, type OrderStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { fetchDisplayNameMap } from "../lib/adminQueries";

// 13 I4【dealer】 좌상 본인 관할 — 소속 라이더 목록(+연락처)·실적 통계·승인/해제 액션.
// RLS가 범위를 강제하므로 쿼리는 필터 없이도 자기 소속만 반환한다.

export interface DealerRiderRow {
  id: string;
  name: string;
  phone: string | null;
  verifyStatus: string;
  isOnline: boolean;
  /** [18 R2] 배분된 개인 한도(P). null=미배분(PER_RIDER 모드에서 0으로 취급). */
  creditLimit: number | null;
  /** [18 R6] 이 라이더의 미정산 POINT 사용액(P) — 배분 대비 소진 표시용. */
  creditUsed: number;
}

const scopeKeys = {
  riders: () => ["dealer", "riders"] as const,
  stats: () => ["dealer", "stats"] as const,
  activeOrders: () => ["dealer", "active-orders"] as const,
};

/** 내 소속 라이더 목록(rider_profiles RLS = dealer_id=self) + 이름/전화. */
export function useMyRiders() {
  return useQuery({
    queryKey: scopeKeys.riders(),
    queryFn: async (): Promise<DealerRiderRow[]> => {
      const { data, error } = await supabase
        .from("rider_profiles")
        .select("id, verify_status, is_online, credit_limit")
        .order("verify_status", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const names = await fetchDisplayNameMap(rows.map((r) => r.id as string));
      // 전화는 profiles에서(소속 라이더 profiles RLS 허용). 이름 맵과 별개 배치.
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", rows.map((r) => r.id as string));
      const phones = new Map((profs ?? []).map((p) => [p.id as string, (p.phone as string) ?? null]));
      // [18 R6] 라이더별 사용액 — v_rider_credit(RLS: 소속 좌상 조회 허용). 배분 대비 소진 표시.
      const { data: credits } = await supabase.from("v_rider_credit").select("rider_id, used");
      const usedMap = new Map((credits ?? []).map((c) => [c.rider_id as string, (c.used as number) ?? 0]));
      return rows.map((r) => ({
        id: r.id as string,
        name: names.get(r.id as string) ?? (r.id as string).slice(0, 8),
        phone: phones.get(r.id as string) ?? null,
        verifyStatus: r.verify_status as string,
        isOnline: Boolean(r.is_online),
        creditLimit: (r.credit_limit as number | null) ?? null,
        creditUsed: usedMap.get(r.id as string) ?? 0,
      }));
    },
  });
}

/**
 * 내 소속 라이더 실적 통계(v_dealer_rider_stats RLS = 자기 소속).
 * [17 Q5] coupon_used_qty(완료 주문 coupon_cost 합) 포함 — 뷰 append 컬럼이라 select("*") +
 * dealerRiderStatsSchema 파싱으로 그대로 통과한다. 조회 전용 — 정산 무관(17 C5).
 */
export function useMyRiderStats() {
  return useQuery({
    queryKey: scopeKeys.stats(),
    queryFn: async (): Promise<DealerRiderStats[]> => {
      const { data, error } = await supabase.from("v_dealer_rider_stats").select("*");
      if (error) throw error;
      return (data ?? []).map((row) => dealerRiderStatsSchema.parse(row));
    },
  });
}

// [16 L6]【dealer】 관할 운영 관제 — v_dealer_active_orders(재무 컬럼 제외 invoker 뷰, 14 §2-5
// 예약 실행). 좌상 행 필터는 스냅샷 RLS p_orders_read_by_dealer가 담당(쿼리 필터 불요).
export interface DealerActiveOrder {
  orderId: string;
  status: OrderStatus;
  orderKind: OrderKind | null;
  riderId: string | null;
  /** 뷰가 폴백까지 처리(현 소속=실명, 전 소속=rider_id 축약 — RLS로 이름 미누출). */
  riderName: string;
  pickupAddress: string;
  purchaseRequestedCans: number | null;
  deliveredCans: number | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  createdAt: string;
}

export function useDealerActiveOrders() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: scopeKeys.activeOrders(),
    queryFn: async (): Promise<DealerActiveOrder[]> => {
      const { data, error } = await supabase
        .from("v_dealer_active_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        orderId: r.order_id as string,
        status: r.status as OrderStatus,
        orderKind: (r.order_kind as OrderKind | null) ?? null,
        riderId: (r.rider_id as string | null) ?? null,
        riderName: (r.rider_name as string) ?? "",
        pickupAddress: (r.pickup_address as string) ?? "",
        purchaseRequestedCans: (r.purchase_requested_cans as number | null) ?? null,
        deliveredCans: (r.delivered_cans as number | null) ?? null,
        acceptedAt: (r.accepted_at as string | null) ?? null,
        arrivedAt: (r.arrived_at as string | null) ?? null,
        createdAt: r.created_at as string,
      }));
    },
  });

  // 뷰는 Realtime 발행 대상이 아니다 — 기저 pickup_orders postgres_changes 구독으로 invalidate
  // (라이더 앱 useOpenCalls 선례. RLS가 수신 범위를 자기 귀속분으로 거른다).
  useEffect(() => {
    const channel = supabase
      .channel("dealer_active_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_orders" }, () => {
        queryClient.invalidateQueries({ queryKey: scopeKeys.activeOrders() });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useDealerScopeMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["dealer"] });
  }

  /** 소속 라이더 승인/반려/정지/해제(rider-verify — 좌상 자기소속 허용). */
  async function verifyRider(
    riderId: string,
    decision: "APPROVED" | "REJECTED" | "SUSPENDED" | "REINSTATED",
    rejectReason?: string,
  ) {
    const result = await invokeEdgeFunction("rider-verify", { riderId, decision, rejectReason });
    if (result.ok) invalidate();
    return result;
  }

  /** 소속 해제(dealer-assign, dealerId=null). */
  async function unassign(riderId: string) {
    const result = await invokeEdgeFunction("dealer-assign", { riderId, dealerId: null });
    if (result.ok) invalidate();
    return result;
  }

  /** [18 R2] 소속 라이더 개인 한도 배분(dealer-rider-limit-set). null=배분 해제. */
  async function setRiderLimit(riderId: string, creditLimit: number | null) {
    const result = await invokeEdgeFunction("dealer-rider-limit-set", { riderId, creditLimit });
    if (result.ok) invalidate();
    return result;
  }

  return { verifyRider, unassign, setRiderLimit };
}

/** [18 R1·R6] 내 좌상 계정(v_dealer_statement 1행) — 배분 모드·총 한도·잔여. RLS로 본인만. */
export function useMyDealerAccount() {
  return useQuery({
    queryKey: ["dealer", "account"],
    queryFn: async (): Promise<{
      allocationMode: "POOL" | "PER_RIDER";
      creditLimit: number;
      usage: number;
      headroom: number;
    } | null> => {
      const { data: stmt, error } = await supabase
        .from("v_dealer_statement")
        .select("credit_limit, usage, headroom")
        .maybeSingle();
      if (error) throw error;
      if (!stmt) return null;
      // allocation_mode는 dealer_accounts 본체에서(뷰 컬럼에 없음 — RLS: 본인+admin).
      const { data: account } = await supabase
        .from("dealer_accounts")
        .select("allocation_mode")
        .maybeSingle();
      return {
        allocationMode: ((account?.allocation_mode as "POOL" | "PER_RIDER") ?? "POOL"),
        creditLimit: (stmt.credit_limit as number) ?? 0,
        usage: (stmt.usage as number) ?? 0,
        headroom: (stmt.headroom as number) ?? 0,
      };
    },
  });
}

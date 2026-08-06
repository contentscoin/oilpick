import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DealerAccountSetInput,
  DealerAssignOutput,
  DealerClaimInput,
  DealerCreateInput,
  DealerCreateOutput,
  DealerSettlement,
  DealerStatement,
  DealerUpdateInput,
  DealerUpdateOutput,
} from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { fetchDisplayNameMap } from "../lib/adminQueries";

// 13 I3【admin】 좌상 관리 — 좌상 목록·생성 + 라이더 소속 배정.

export interface DealerRow {
  id: string;
  displayName: string;
  phone: string;
}

export interface AssignableRiderRow {
  id: string;
  name: string;
  verifyStatus: string;
  dealerId: string | null;
  dealerName: string | null;
}

const dealerKeys = {
  dealers: () => ["admin", "dealers"] as const,
  assignableRiders: () => ["admin", "dealers", "riders"] as const,
};

/** 좌상 계정 목록(profiles.role='dealer'). admin RLS로 전체 조회. */
export function useDealers() {
  return useQuery({
    queryKey: dealerKeys.dealers(),
    queryFn: async (): Promise<DealerRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, phone")
        .eq("role", "dealer")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        displayName: (r.display_name as string) ?? "",
        phone: (r.phone as string) ?? "",
      }));
    },
  });
}

/** 배정 대상 라이더 목록(전체) + 현재 소속 좌상 표시. 이름은 batch 조회로 붙인다. */
export function useAssignableRiders() {
  return useQuery({
    queryKey: dealerKeys.assignableRiders(),
    queryFn: async (): Promise<AssignableRiderRow[]> => {
      const { data, error } = await supabase
        .from("rider_profiles")
        .select("id, verify_status, dealer_id")
        .order("verify_status", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const names = await fetchDisplayNameMap([
        ...rows.map((r) => r.id as string),
        ...rows.map((r) => r.dealer_id as string).filter(Boolean),
      ]);
      return rows.map((r) => ({
        id: r.id as string,
        name: names.get(r.id as string) ?? (r.id as string).slice(0, 8),
        verifyStatus: r.verify_status as string,
        dealerId: (r.dealer_id as string) ?? null,
        dealerName: r.dealer_id ? (names.get(r.dealer_id as string) ?? null) : null,
      }));
    },
  });
}

export function useDealerMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "dealers"] });
  }

  async function createDealer(input: DealerCreateInput) {
    const result = await invokeEdgeFunction<DealerCreateOutput>("dealer-create", { ...input });
    if (result.ok) invalidate();
    return result;
  }

  async function assignRider(riderId: string, dealerId: string | null) {
    const result = await invokeEdgeFunction<DealerAssignOutput>("dealer-assign", { riderId, dealerId });
    if (result.ok) invalidate();
    return result;
  }

  // [13 I2 보강, CEO 2026-08-06] 좌상 아이디/비밀번호/상호/연락처 수정 — dealer-update Edge.
  async function updateDealer(input: DealerUpdateInput) {
    const result = await invokeEdgeFunction<DealerUpdateOutput>("dealer-update", { ...input });
    if (result.ok) invalidate();
    return result;
  }

  return { createDealer, assignRider, updateDealer };
}

// ===== 14 J3 좌상 정산 =====

/** v_dealer_statement — admin은 전체, dealer는 본인 1행(RLS). usage 큰 순. */
export function useDealerStatements() {
  return useQuery({
    queryKey: ["admin", "dealerStatements"],
    queryFn: async (): Promise<DealerStatement[]> => {
      const { data, error } = await supabase
        .from("v_dealer_statement")
        .select("*")
        .order("usage", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DealerStatement[];
    },
  });
}

/**
 * [16 L7]【dealer】 미정산 주문 라인 — v_dealer_settlement_orders에서 아직 청구에 스탬핑되지
 * 않은(dealer_settlement_id is null) 본인 주문. /statement의 usage 카드 숫자가 어느 주문에서
 * 왔는지 1:1 대사용(14 §5 【D】 "미정산 라인" 명세의 미구현분). RLS로 본인 귀속분만.
 */
export interface DealerUnsettledOrder {
  order_id: string;
  payout_method: "CASH" | "POINT" | null;
  cash_paid_amount: number | null;
  purchase_amount: number | null;
  net_amount: number | null;
  completed_at: string | null;
}

export function useDealerUnsettledOrders() {
  return useQuery({
    queryKey: ["admin", "dealerUnsettledOrders"],
    queryFn: async (): Promise<DealerUnsettledOrder[]> => {
      const { data, error } = await supabase
        .from("v_dealer_settlement_orders")
        .select("order_id, payout_method, cash_paid_amount, purchase_amount, net_amount, completed_at")
        .is("dealer_settlement_id", null)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DealerUnsettledOrder[];
    },
  });
}

/** dealer_settlements — 청구 이력(최신순). admin 전체, dealer 본인(RLS). */
export function useDealerSettlements() {
  return useQuery({
    queryKey: ["admin", "dealerSettlements"],
    queryFn: async (): Promise<DealerSettlement[]> => {
      const { data, error } = await supabase
        .from("dealer_settlements")
        .select("*")
        .order("claimed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DealerSettlement[];
    },
  });
}

export function useDealerSettlementMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "dealerStatements"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "dealerSettlements"] });
  }

  async function setDealerAccount(input: DealerAccountSetInput) {
    const result = await invokeEdgeFunction("dealer-account-set", { ...input });
    if (result.ok) invalidate();
    return result;
  }

  async function dealerClaim(input: DealerClaimInput) {
    const result = await invokeEdgeFunction("dealer-claim", { ...input });
    if (result.ok) invalidate();
    return result;
  }

  return { setDealerAccount, dealerClaim };
}

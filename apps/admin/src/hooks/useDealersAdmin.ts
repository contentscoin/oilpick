import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DealerAssignOutput, DealerCreateInput, DealerCreateOutput } from "@oilpick/core";
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

  return { createDealer, assignRider };
}

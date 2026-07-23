import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dealerRiderStatsSchema, type DealerRiderStats } from "@oilpick/core";
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
}

const scopeKeys = {
  riders: () => ["dealer", "riders"] as const,
  stats: () => ["dealer", "stats"] as const,
};

/** 내 소속 라이더 목록(rider_profiles RLS = dealer_id=self) + 이름/전화. */
export function useMyRiders() {
  return useQuery({
    queryKey: scopeKeys.riders(),
    queryFn: async (): Promise<DealerRiderRow[]> => {
      const { data, error } = await supabase
        .from("rider_profiles")
        .select("id, verify_status, is_online")
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
      return rows.map((r) => ({
        id: r.id as string,
        name: names.get(r.id as string) ?? (r.id as string).slice(0, 8),
        phone: phones.get(r.id as string) ?? null,
        verifyStatus: r.verify_status as string,
        isOnline: Boolean(r.is_online),
      }));
    },
  });
}

/** 내 소속 라이더 실적 통계(v_dealer_rider_stats RLS = 자기 소속). */
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

  return { verifyRider, unassign };
}

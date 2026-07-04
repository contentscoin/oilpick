import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export type VerifyStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RiderProfile {
  id: string;
  displayName: string;
  vehicleNumber: string;
  verifyStatus: VerifyStatus;
  rejectReason: string | null;
  isOnline: boolean;
}

/**
 * profiles + rider_profiles 조회 + Realtime 구독. R1 "PENDING 대기 화면(Realtime으로
 * rider_profiles.verify_status 변경 감지해 자동 전환)"에 쓰인다(03-frontend.md apps/rider 표).
 */
export function useRiderProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.riderProfile(userId ?? "");

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async (): Promise<RiderProfile | null> => {
      if (!userId) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return null;

      const { data: rider, error: riderError } = await supabase
        .from("rider_profiles")
        .select("vehicle_number, verify_status, reject_reason, is_online")
        .eq("id", userId)
        .maybeSingle();
      if (riderError) throw riderError;
      if (!rider) return null;

      return {
        id: profile.id,
        displayName: profile.display_name,
        vehicleNumber: rider.vehicle_number,
        verifyStatus: rider.verify_status,
        rejectReason: rider.reject_reason,
        isOnline: rider.is_online,
      };
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`rider_profiles_self_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rider_profiles",
          filter: `id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.riderProfile(userId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKeys.riderProfile(userId)는 매 렌더 새 배열을 반환하므로 deps에는 userId만 사용한다
    // (apps/user useActiveOrder.ts와 동일 패턴 — 그렇지 않으면 매 렌더 채널을 재구독한다).
  }, [userId, queryClient]);

  return query;
}

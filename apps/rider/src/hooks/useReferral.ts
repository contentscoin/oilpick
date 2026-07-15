import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReferralCodeOutput, ReferralStats } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { queryKeys } from "../lib/queryClient";

/**
 * [09 H4] 라이더 추천코드 발급/조회(referral-code Edge). 세션 라이더 본인, 없으면 서버가 생성해 반환.
 * 코드·공유링크는 불변이라 staleTime=Infinity로 세션 내 1회만 호출한다(idempotent 서버 보장).
 */
export function useReferralCode(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.referralCode(),
    enabled,
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<ReferralCodeOutput> => {
      const res = await invokeEdgeFunction<ReferralCodeOutput>("referral-code", {});
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });
}

/**
 * [09 H4] 라이더 추천 실적(v_referral_stats — 본인 1행, RLS가 자동 스코프). 추천이 없으면 null.
 * referrals Realtime(attach/activate INSERT·UPDATE) 수신 시 실적 키를 invalidate해 폴링 없이 갱신한다.
 */
export function useReferralStats(riderId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.referralStats(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<ReferralStats | null> => {
      if (!riderId) return null;
      const { data, error } = await supabase
        .from("v_referral_stats")
        .select("referrer_rider_id, signed_up, activated, supplier_bonus_paid, rider_reward_earned")
        .eq("referrer_rider_id", riderId)
        .maybeSingle();
      if (error) throw error;
      return (data as ReferralStats) ?? null;
    },
  });

  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`referrals_rider_${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "referrals",
          filter: `referrer_rider_id=eq.${riderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.referralStats(riderId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKeys.referralStats(riderId)는 매 렌더 새 배열이므로 deps에는 riderId만(useActiveRun 패턴).
  }, [riderId, queryClient]);

  return query;
}

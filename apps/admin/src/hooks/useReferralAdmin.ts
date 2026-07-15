import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * [09 H4]【A】레퍼럴 실적분석 데이터 훅.
 *  - 라이더별 퍼널: v_referral_stats(admin은 RLS로 전체 조회) + 이름 join → 가입/활성화/전환율/보너스/보상.
 *  - 일별 추이: v_referral_daily(is_admin() 게이트 뷰) — 일별 가입/당일활성화.
 * referrals Realtime(attach/activate) 수신 시 ["admin","referral"] 프리픽스를 invalidate해 폴링 없이 갱신.
 * 원장·referrals 쓰기는 어디에도 없다(조회 전용, 절대 규칙 1).
 */

async function fetchDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

function sinceIso(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().slice(0, 10);
}

// ===== 라이더별 추천 퍼널 =====

export interface ReferralStatRow {
  riderId: string;
  riderName: string;
  signedUp: number;
  activated: number;
  /** 전환율(%) = activated / signedUp. signedUp=0이면 0. */
  conversion: number;
  supplierBonusPaid: number;
  riderRewardEarned: number;
}

/** 라이더별 추천 퍼널(v_referral_stats). 활성화 많은 순 정렬. referrals Realtime으로 갱신. */
export function useReferralStatsAdmin() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.referralStats(),
    queryFn: async (): Promise<ReferralStatRow[]> => {
      const { data, error } = await supabase
        .from("v_referral_stats")
        .select("referrer_rider_id, signed_up, activated, supplier_bonus_paid, rider_reward_earned");
      if (error) throw error;

      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.referrer_rider_id as string));
      return (data ?? [])
        .map((row) => {
          const signedUp = Number(row.signed_up ?? 0);
          const activated = Number(row.activated ?? 0);
          const riderId = row.referrer_rider_id as string;
          return {
            riderId,
            riderName: nameMap.get(riderId) ?? riderId.slice(0, 8),
            signedUp,
            activated,
            conversion: signedUp > 0 ? Math.round((activated / signedUp) * 100) : 0,
            supplierBonusPaid: Number(row.supplier_bonus_paid ?? 0),
            riderRewardEarned: Number(row.rider_reward_earned ?? 0),
          };
        })
        .sort((a, b) => b.activated - a.activated || b.signedUp - a.signedUp);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_referrals")
      .on("postgres_changes", { event: "*", schema: "public", table: "referrals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "referral"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// ===== 일별 추이 =====

export interface ReferralDailyRow {
  day: string;
  signedUp: number;
  activatedSameDay: number;
}

/** 일별 추천 추이(v_referral_daily). 최근 days일 가입/당일활성화. */
export function useReferralDaily(days = 30) {
  return useQuery({
    queryKey: queryKeys.referralDaily(days),
    queryFn: async (): Promise<ReferralDailyRow[]> => {
      const { data, error } = await supabase
        .from("v_referral_daily")
        .select("day, signed_up, activated_same_day")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        day: row.day as string,
        signedUp: Number(row.signed_up ?? 0),
        activatedSameDay: Number(row.activated_same_day ?? 0),
      }));
    },
  });
}

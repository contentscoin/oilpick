import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { referralConversionRate } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import { fetchDisplayNameMap, sinceIso } from "../lib/adminQueries";

/**
 * [09 H4]【A】레퍼럴 실적분석 데이터 훅.
 *  - 라이더별 퍼널: v_referral_stats(admin은 RLS로 전체 조회) + 이름 join → 가입/활성화/전환율/보너스/보상.
 *  - 일별 추이: v_referral_daily(is_admin() 게이트 뷰) — 일별 가입/활성화.
 * referrals Realtime(attach/activate) 수신 시 ["admin","referral"] 프리픽스를 invalidate해 폴링 없이 갱신.
 * 원장·referrals 쓰기는 어디에도 없다(조회 전용, 절대 규칙 1). useReferralStatsAdmin은 ReferralsPage 부모에서
 * 1회만 마운트해 자식(Summary·Funnel)에 props로 내린다 — 다중 마운트 시 고정 채널 토픽 공유 결함을 구조적으로 회피.
 */

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
  /** [09 H8] 보상 정산 분리 합계 — settled+unsettled=earned. */
  riderRewardSettled: number;
  riderRewardUnsettled: number;
}

/** 라이더별 추천 퍼널(v_referral_stats). 활성화 많은 순 정렬. referrals Realtime으로 갱신. */
export function useReferralStatsAdmin() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.referralStats(),
    queryFn: async (): Promise<ReferralStatRow[]> => {
      const { data, error } = await supabase
        .from("v_referral_stats")
        .select(
          "referrer_rider_id, signed_up, activated, supplier_bonus_paid, rider_reward_earned, rider_reward_settled, rider_reward_unsettled",
        );
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
            conversion: referralConversionRate(activated, signedUp),
            supplierBonusPaid: Number(row.supplier_bonus_paid ?? 0),
            riderRewardEarned: Number(row.rider_reward_earned ?? 0),
            riderRewardSettled: Number(row.rider_reward_settled ?? 0),
            riderRewardUnsettled: Number(row.rider_reward_unsettled ?? 0),
          };
        })
        .sort((a, b) => b.activated - a.activated || b.signedUp - a.signedUp);
    },
  });

  // 부모에서 1회만 마운트하므로 고정 토픽으로 충분하다(다중 마운트 시 채널 공유 결함은 구조로 회피 —
  // 상단 훅 주석). 채널 1개가 ["admin","referral"] 프리픽스를 invalidate해 퍼널·일별 추이를 함께 갱신.
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
  /** 그 날짜에 활성화(첫 수거 완료)된 추천 수 — 가입일이 아니라 activated_at::date 기준(뷰가 UNION으로 분리 집계). */
  activated: number;
}

/** 일별 추천 추이(v_referral_daily). 최근 days일 일별 가입/활성화(각각 자기 날짜 버킷). */
export function useReferralDaily(days = 30) {
  return useQuery({
    queryKey: queryKeys.referralDaily(days),
    queryFn: async (): Promise<ReferralDailyRow[]> => {
      const { data, error } = await supabase
        .from("v_referral_daily")
        .select("day, signed_up, activated")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        day: row.day as string,
        signedUp: Number(row.signed_up ?? 0),
        activated: Number(row.activated ?? 0),
      }));
    },
  });
}

// ===== [09 H8] 보상 정산 큐 =====

export interface UnsettledReferralRow {
  id: string;
  riderId: string;
  riderName: string;
  supplierId: string;
  supplierName: string;
  riderReward: number;
  activatedAt: string;
}

/**
 * 미정산 보상 큐 — ACTIVATED이면서 reward_settled_at이 null인 추천(오래된 활성화 순).
 * referrals 직접 조회는 admin RLS(p_referral_read)로 허용되는 read 전용 — 정산 마킹은
 * referral-settle Edge(fn_settle_referral_reward)로만 쓴다(절대 규칙 1 확장).
 */
export function useUnsettledReferrals() {
  return useQuery({
    queryKey: queryKeys.referralUnsettled(),
    queryFn: async (): Promise<UnsettledReferralRow[]> => {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, referrer_rider_id, referred_supplier_id, rider_reward, activated_at")
        .eq("status", "ACTIVATED")
        .is("reward_settled_at", null)
        .order("activated_at", { ascending: true })
        .limit(200);
      if (error) throw error;

      const ids = (data ?? []).flatMap((r) => [r.referrer_rider_id as string, r.referred_supplier_id as string]);
      const nameMap = await fetchDisplayNameMap(ids);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        riderId: row.referrer_rider_id as string,
        riderName: nameMap.get(row.referrer_rider_id as string) ?? (row.referrer_rider_id as string).slice(0, 8),
        supplierId: row.referred_supplier_id as string,
        supplierName:
          nameMap.get(row.referred_supplier_id as string) ?? (row.referred_supplier_id as string).slice(0, 8),
        riderReward: Number(row.rider_reward ?? 0),
        activatedAt: row.activated_at as string,
      }));
    },
  });
}

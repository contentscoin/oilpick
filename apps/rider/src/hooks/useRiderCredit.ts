import { useQuery } from "@tanstack/react-query";
import type { RiderCredit } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

/**
 * [18 R6] v_rider_credit — 라이더 본인의 포인트 지급 한도/사용/잔여.
 * RLS(p_rider_self)로 본인 1행만 보인다. 소속 없음(본사 직속)·좌상 계정 미설정이면
 * is_unlimited=true / limit_amount=null → 게이지 미노출(한도 자체가 없다).
 *
 * 완료 전이가 사용액을 바꾸므로 화면 진입·포커스마다 신선도를 확보한다(Realtime 미구독 —
 * 게이지는 보조 정보라 폴링 비용을 들이지 않고 staleTime을 짧게 잡는다).
 */
export function useRiderCredit(riderId: string | undefined) {
  return useQuery({
    queryKey: ["rider", "credit", riderId],
    enabled: Boolean(riderId),
    staleTime: 30_000,
    queryFn: async (): Promise<RiderCredit | null> => {
      const { data, error } = await supabase
        .from("v_rider_credit")
        .select("rider_id, dealer_id, allocation_mode, limit_amount, used, available, is_unlimited")
        .eq("rider_id", riderId!)
        .maybeSingle();
      if (error) throw error;
      return (data as RiderCredit | null) ?? null;
    },
  });
}

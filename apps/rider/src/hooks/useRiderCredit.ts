import { useQuery } from "@tanstack/react-query";
import type { RiderCredit } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

/** 크레딧 쿼리 키 — 계량 제출·완료 후 무효화에 쓴다(18 R7). */
export const riderCreditQueryKey = (riderId: string | undefined) => ["rider", "credit", riderId] as const;

/**
 * [18 R6] v_rider_credit — 라이더 본인의 포인트 지급 한도/사용/예약/잔여.
 * 뷰가 소유자 권한으로 집계하고 본문 술어로 본인 1행만 돌려준다(라이더는 dealer_accounts를
 * 읽을 수 없어 security_invoker로는 뷰가 붕괴한다 — 마이그레이션 ④ 주석 참조).
 * 소속 없음(본사 직속)·좌상 계정 미설정이면 is_unlimited=true / limit_amount=null → 게이지 미노출.
 *
 * available은 확정 사용액(COMPLETED)과 **예약분**(제출 후 점주 확인 전)을 모두 뺀 값이다.
 * 완료·제출 전이가 이 값을 바꾸므로 staleTime을 짧게 잡고, 계량 제출 성공 시 호출부가
 * riderCreditQueryKey로 즉시 무효화한다(낡은 잔여로 통과하는 창 제거).
 */
export function useRiderCredit(riderId: string | undefined) {
  return useQuery({
    queryKey: riderCreditQueryKey(riderId),
    enabled: Boolean(riderId),
    staleTime: 30_000,
    queryFn: async (): Promise<RiderCredit | null> => {
      const { data, error } = await supabase
        .from("v_rider_credit")
        .select("rider_id, dealer_id, allocation_mode, limit_amount, used, reserved, available, is_unlimited")
        .eq("rider_id", riderId!)
        .maybeSingle();
      if (error) throw error;
      return (data as RiderCredit | null) ?? null;
    },
  });
}

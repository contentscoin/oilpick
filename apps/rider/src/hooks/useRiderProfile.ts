import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/** Realtime 채널 토픽 유일화용 시퀀스(훅 인스턴스 동시 마운트 시 토픽 충돌 방지 — 아래 주석). */
let riderProfileChannelSeq = 0;

export type VerifyStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RiderProfile {
  id: string;
  displayName: string;
  vehicleNumber: string;
  verifyStatus: VerifyStatus;
  rejectReason: string | null;
  isOnline: boolean;
  /** 소속 좌상 상호(13 I5). 미배정이면 null. */
  dealerName: string | null;
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
        .select("vehicle_number, verify_status, reject_reason, is_online, dealer_id")
        .eq("id", userId)
        .maybeSingle();
      if (riderError) throw riderError;
      if (!rider) return null;

      // 소속 좌상 상호(13 I5). RLS p_profiles_read_my_dealer가 자기 좌상 1행만 허용.
      // 부가 표기이므로 조회 실패는 null로 강등(마이 화면을 깨지 않음).
      let dealerName: string | null = null;
      if (rider.dealer_id) {
        const { data: dealer } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", rider.dealer_id)
          .maybeSingle();
        dealerName = dealer?.display_name ?? null;
      }

      return {
        id: profile.id,
        displayName: profile.display_name,
        vehicleNumber: rider.vehicle_number,
        verifyStatus: rider.verify_status,
        rejectReason: rider.reject_reason,
        isOnline: rider.is_online,
        dealerName,
      };
    },
  });

  useEffect(() => {
    if (!userId) return;
    // 토픽에 인스턴스 시퀀스를 붙인다 — supabase-js는 동일 토픽이면 기존 채널 인스턴스를
    // 재사용하므로, 루트 CallAlertListener(06 E3)와 페이지가 이 훅을 "동시에" 마운트하면
    // 나중 바인딩은 join id가 없어 영원히 발화하지 않고, 페이지 unmount의 removeChannel이
    // 공유 채널을 죽여 루트 구독까지 끊긴다(적대적 리뷰 확정 결함). 고유 토픽이면 무해.
    const channel = supabase
      .channel(`rider_profiles_self_${userId}_${++riderProfileChannelSeq}`)
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

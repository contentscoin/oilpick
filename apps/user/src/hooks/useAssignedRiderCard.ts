import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface AssignedRiderCard {
  id: string;
  displayName: string;
  phone: string;
  vehicleNumber: string;
  verifyStatus: "PENDING" | "APPROVED" | "REJECTED";
}

/**
 * 배정된 라이더 카드 정보. 03-frontend.md U6~U9: "라이더 카드(이름/차량/인증배지/전화 tel:)".
 * profiles(이름/전화) + rider_profiles(차량번호/인증상태) 조회.
 * supplier가 이 정보를 읽으려면 20260704000010_rider_card_read_policy.sql의 RLS 정책
 * (자신에게 배정된 라이더의 profiles/rider_profiles row read)이 필요하다.
 */
export function useAssignedRiderCard(riderId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.riderCard(riderId ?? ""),
    enabled: Boolean(riderId),
    queryFn: async (): Promise<AssignedRiderCard | null> => {
      if (!riderId) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, phone")
        .eq("id", riderId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return null;

      const { data: rider, error: riderError } = await supabase
        .from("rider_profiles")
        .select("vehicle_number, verify_status")
        .eq("id", riderId)
        .maybeSingle();
      if (riderError) throw riderError;

      return {
        id: profile.id,
        displayName: profile.display_name,
        phone: profile.phone,
        vehicleNumber: rider?.vehicle_number ?? "",
        verifyStatus: rider?.verify_status ?? "PENDING",
      };
    },
  });
}

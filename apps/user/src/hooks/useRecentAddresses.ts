import { useQuery } from "@tanstack/react-query";
import { parseGeographyPoint } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface RecentAddress {
  address: string;
  lat: number;
  lng: number;
}

/**
 * 07 F9-②: 수거 요청 step2의 "최근 주소 재사용" 칩. 본인 완료(COMPLETED) 주문의 주소를
 * distinct 최근 2건 조회해 칩 탭 시 주소·좌표를 프리필한다. 스키마 무변경 — 본인 주문은
 * RLS(supplier_id = auth.uid())로 조회 가능하다.
 *
 * 좌표는 pickup_location(geography)에서 core parseGeographyPoint로 뽑는다(12 S1: EWKB hex·
 * GeoJSON 겸용 단일 파서). 파싱 실패 행은 스킵.
 */
const RECENT_ADDRESS_LIMIT = 2;
// distinct 2건을 뽑기 위해 최근 완료 주문을 넉넉히 조회한 뒤 클라이언트에서 주소 기준 중복 제거.
const RECENT_ADDRESS_SCAN = 20;

export function useRecentAddresses(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recentAddresses(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<RecentAddress[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("pickup_address, pickup_location, created_at")
        .eq("supplier_id", userId)
        .eq("status", "COMPLETED")
        .order("created_at", { ascending: false })
        .limit(RECENT_ADDRESS_SCAN);
      if (error) throw error;

      const seen = new Set<string>();
      const result: RecentAddress[] = [];
      for (const row of data ?? []) {
        const address = row.pickup_address as string;
        if (!address || seen.has(address)) continue;
        const point = parseGeographyPoint(row.pickup_location);
        if (!point) continue;
        seen.add(address);
        result.push({ address, lat: point.lat, lng: point.lng });
        if (result.length >= RECENT_ADDRESS_LIMIT) break;
      }
      return result;
    },
  });
}

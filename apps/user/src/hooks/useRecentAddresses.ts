import { useQuery } from "@tanstack/react-query";
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
 * 좌표는 pickup_location(geography) 컬럼에서 뽑는다. supabase-js/PostgREST는 geography를
 * GeoJSON 객체({type:"Point",coordinates:[lng,lat]})로 직렬화하므로 rider useOpenCalls와 동일
 * 패턴으로 파싱한다(RPC/뷰 없이).
 */
function parsePoint(raw: unknown): { lat: number; lng: number } | null {
  if (raw && typeof raw === "object" && "coordinates" in raw) {
    const coords = (raw as { coordinates: [number, number] }).coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lat: coords[1], lng: coords[0] };
    }
  }
  return null;
}

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
        const point = parsePoint(row.pickup_location);
        if (!point) continue;
        seen.add(address);
        result.push({ address, lat: point.lat, lng: point.lng });
        if (result.length >= RECENT_ADDRESS_LIMIT) break;
      }
      return result;
    },
  });
}

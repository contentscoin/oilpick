import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface OpenCall {
  id: string;
  requestedKg: number;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  /** 주문 생성 시점 시세 스냅샷(원/kg). 예상 매입 지급액 = requestedKg × 이 값(07 F5). */
  snapshotPricePerKg: number;
  /** 소진 쿠폰 장수(coupon_cost). 레거시 주문은 null(CONSUME/REFUND skip, 쿠폰 표기 생략 — 07 §1-2). */
  couponCost: number | null;
  /** 레거시 수거비(구모델). 신규 주문은 미기록(null). 표기하지 않음 — 07 F5에서 매입액으로 전환. */
  snapshotRiderFee: number | null;
  createdAt: string;
}

/**
 * PostGIS geography(point) select 결과는 supabase-js에서 GeoJSON 문자열로 오는 경우가 많아
 * lat/lng을 안전하게 뽑기 위해 RPC 대신 PostGIS의 ST_X/ST_Y를 쓰는 뷰가 없으므로, 이 훅은
 * `pickup_location` 대신 이미 pickup_orders에 저장된 원본 위/경도가 없다는 점을 감안해
 * 서버가 좌표를 텍스트로 내려주는 postgis geography의 기본 select(WKB hex)를 그대로 파싱한다.
 * 여기서는 간단히 select 시 postgis가 반환하는 GeoJSON(select ...->'coordinates')을 쓰는 대신,
 * 01-db-schema.sql에 위/경도 개별 컬럼이 없으므로 detail 조회 시 RPC `st_x/st_y`를 쓰지 않고
 * pickup_orders.pickup_location을 그대로 텍스트로 받아 파싱한다(postgis GeoJSON 모드).
 */
function parsePoint(raw: unknown): { lat: number; lng: number } {
  // supabase-js postgrest는 geography 컬럼을 GeoJSON 객체({type:"Point",coordinates:[lng,lat]})로 반환한다
  // (PostgREST 기본 동작 — geography는 자동으로 GeoJSON으로 직렬화됨).
  if (raw && typeof raw === "object" && "coordinates" in raw) {
    const coords = (raw as { coordinates: [number, number] }).coordinates;
    return { lat: coords[1], lng: coords[0] };
  }
  return { lat: 0, lng: 0 };
}

/**
 * R2 콜 홈 목록. 03-frontend.md: "REQUESTED 주문 목록(RLS의 open_calls 정책으로 조회, 거리순
 * 정렬은 클라이언트에서 좌표로 계산)". RLS p_order_open_calls가 APPROVED 라이더에게만
 * REQUESTED 행을 보여준다 — verify_status가 APPROVED가 아니면 이 쿼리는 빈 배열을 반환한다.
 */
export function useOpenCalls(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.openCalls(),
    enabled,
    queryFn: async (): Promise<OpenCall[]> => {
      const { data, error } = await supabase
        .from("pickup_orders")
        .select(
          "id, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost, snapshot_rider_fee, created_at",
        )
        .eq("status", "REQUESTED")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { lat, lng } = parsePoint(row.pickup_location);
        return {
          id: row.id,
          requestedKg: row.requested_kg,
          pickupAddress: row.pickup_address,
          pickupLat: lat,
          pickupLng: lng,
          snapshotPricePerKg: row.snapshot_price_per_kg,
          couponCost: row.coupon_cost ?? null,
          snapshotRiderFee: row.snapshot_rider_fee ?? null,
          createdAt: row.created_at,
        };
      });
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("pickup_orders_open_calls")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.openCalls() });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return query;
}

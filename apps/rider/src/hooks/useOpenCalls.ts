import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseGeographyPoint } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface OpenCall {
  id: string;
  requestedKg: number;
  pickupAddress: string;
  /** 수거지 좌표. pickup_location 파싱 실패(비정상 데이터) 시 null — 거리/지도는 미표기로 강등. */
  pickupLat: number | null;
  pickupLng: number | null;
  /** 주문 생성 시점 시세 스냅샷(원/kg). 예상 매입 지급액 = requestedKg × 이 값(07 F5). */
  snapshotPricePerKg: number;
  /** 레거시 수거비(구모델). 신규 주문은 미기록(null). 표기하지 않음 — 07 F5에서 매입액으로 전환. */
  snapshotRiderFee: number | null;
  /** [17 Q3] 소진 쿠폰 장수 스냅샷(coupon_cost). 전환기 무쿠폰 주문(08 구간)은 null → 칩·게이트 생략. */
  couponCost: number | null;
  /** [N5] 점주 희망 시간 — 'YYYY-MM-DD HH:mm' 또는 레거시 '지금'. 저장 문자열 그대로 표시. */
  preferredTime: string | null;
  createdAt: string;
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
        // [17 Q3] coupon_cost 조회 재개(08 G6-②의 역연산) — 콜 카드 칩·수락 게이트 사전 체크용.
        // [N5] preferred_time 추가 — 콜 카드/상세에 점주 희망 시간 노출.
        .select(
          "id, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, snapshot_rider_fee, coupon_cost, preferred_time, created_at",
        )
        .eq("status", "REQUESTED")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const point = parseGeographyPoint(row.pickup_location);
        return {
          id: row.id,
          requestedKg: row.requested_kg,
          pickupAddress: row.pickup_address,
          pickupLat: point?.lat ?? null,
          pickupLng: point?.lng ?? null,
          snapshotPricePerKg: row.snapshot_price_per_kg,
          snapshotRiderFee: row.snapshot_rider_fee ?? null,
          couponCost: row.coupon_cost ?? null,
          preferredTime: row.preferred_time ?? null,
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

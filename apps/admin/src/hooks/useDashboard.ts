import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseGeographyPoint } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

const ACTIVE_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"] as const;

export interface DashboardOrder {
  id: string;
  status: string;
  lat: number;
  lng: number;
  requestedKg: number;
  pickupAddress: string;
}

/**
 * 대시보드 지도용 진행중 주문 핀. 03-frontend.md "/": "카카오맵 전체 지도(진행중 주문 핀 +
 * 온라인 라이더 핀, Realtime)". pickup_location은 PostGIS geography(point) — 이 환경의
 * PostgREST는 WKB hex 문자열로 반환한다(core parseGeographyPoint가 hex·GeoJSON 겸용 파싱, 12 S1).
 */
export function useDashboardOrders() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.dashboardOrders(),
    queryFn: async (): Promise<DashboardOrder[]> => {
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, status, pickup_location, requested_kg, pickup_address")
        .in("status", ACTIVE_STATUSES as unknown as string[])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const point = parseGeographyPoint(row.pickup_location);
          if (!point) return null;
          return {
            id: row.id as string,
            status: row.status as string,
            lat: point.lat,
            lng: point.lng,
            requestedKg: Number(row.requested_kg),
            pickupAddress: row.pickup_address as string,
          };
        })
        .filter((v): v is DashboardOrder => v !== null);
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_dashboard_orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboardOrders() });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboardKpi(todayKey()) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface DashboardRider {
  id: string;
  lat: number;
  lng: number;
}

/** 대시보드 지도용 온라인 라이더 핀. */
export function useDashboardRiders() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.dashboardRiders(),
    queryFn: async (): Promise<DashboardRider[]> => {
      const { data, error } = await supabase
        .from("rider_profiles")
        .select("id, last_location")
        .eq("is_online", true)
        .eq("verify_status", "APPROVED");
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const point = parseGeographyPoint(row.last_location);
          if (!point) return null;
          return { id: row.id as string, lat: point.lat, lng: point.lng };
        })
        .filter((v): v is DashboardRider => v !== null);
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_dashboard_riders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rider_profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboardRiders() });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface DashboardKpi {
  /** 오늘 생성된 주문 수. */
  orderCount: number;
  /** 오늘 완료된 수거 무게 합(completed_at 기준). */
  collectedKg: number;
  /** 오늘 현금 지급 합(원) — coalesce(payout_method,'CASH')='CASH'인 cash_paid_amount(08 P3). */
  cashPaidAmount: number;
  /** 오늘 포인트 지급 합(P) — payout_method='POINT'인 cash_paid_amount(1P=1원, 08 P3). */
  pointPaidAmount: number;
  /** 출금 대기(REQUESTED) 건수 — 08 P4 출금 부활. */
  pendingWithdrawals: number;
  /** 온라인·승인 라이더 수. */
  activeRiderCount: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 오늘 KPI 카드(08 G7-②): 오늘 주문 / 오늘 수거 kg / 오늘 현금 지급 / 오늘 포인트 지급 /
 * 출금 대기 / 활성 라이더. 07의 쿠폰 판매·소진 카드는 제거(쿠폰 모델 폐기, 08 P1).
 * 수거 kg·지급은 completed_at 기준(payout_method null=레거시 → CASH 간주, 08 P3),
 * 출금 대기는 withdrawals status=REQUESTED 카운트.
 */
export function useDashboardKpi() {
  const day = todayKey();
  return useQuery({
    queryKey: queryKeys.dashboardKpi(day),
    queryFn: async (): Promise<DashboardKpi> => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startIso = startOfDay.toISOString();

      const [orderCountRes, ridersRes, completedRes, withdrawalsRes] = await Promise.all([
        supabase
          .from("pickup_orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startIso),
        supabase
          .from("rider_profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_online", true)
          .eq("verify_status", "APPROVED"),
        supabase
          .from("pickup_orders")
          .select("final_kg, payout_method, cash_paid_amount, net_amount")
          .eq("status", "COMPLETED")
          .gte("completed_at", startIso),
        supabase
          .from("withdrawals")
          .select("id", { count: "exact", head: true })
          .eq("status", "REQUESTED"),
      ]);
      if (orderCountRes.error) throw orderCountRes.error;
      if (ridersRes.error) throw ridersRes.error;
      if (completedRes.error) throw completedRes.error;
      if (withdrawalsRes.error) throw withdrawalsRes.error;

      const completedRows = completedRes.data ?? [];
      const collectedKg = completedRows.reduce((sum, r) => sum + (Number(r.final_kg) || 0), 0);
      let cashPaidAmount = 0;
      let pointPaidAmount = 0;
      for (const r of completedRows) {
        // [14 J4] 실제 지급액은 상계 순액. cash_paid_amount는 폐유 총액으로 동결돼 있어
        // 신유 구매 동반 주문에서 과다 계상되고, net<0(점주가 지불)이면 부호까지 반대다.
        // 레거시(net_amount null)는 cash_paid_amount로 폴백.
        const amount = r.net_amount != null ? Number(r.net_amount) || 0 : Number(r.cash_paid_amount) || 0;
        if (r.payout_method === "POINT") pointPaidAmount += amount;
        else cashPaidAmount += amount;
      }

      return {
        orderCount: orderCountRes.count ?? 0,
        collectedKg,
        cashPaidAmount,
        pointPaidAmount,
        pendingWithdrawals: withdrawalsRes.count ?? 0,
        activeRiderCount: ridersRes.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

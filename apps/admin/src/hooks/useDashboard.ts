import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
 * PostgREST는 WKB hex 문자열로 반환한다(parseGeographyPoint 주석 참고, 실측 검증됨).
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
          .select("final_kg, payout_method, cash_paid_amount")
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
        const amount = Number(r.cash_paid_amount) || 0;
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

/**
 * PostGIS geography(point,4326) select 결과 파싱.
 *
 * apps/rider/src/hooks/useOpenCalls.ts의 `parsePoint`는 "PostgREST가 geography를 GeoJSON
 * 객체로 직렬화한다"는 주석을 달고 GeoJSON만 처리했지만, 이 admin 대시보드를 실제 로컬
 * Supabase 스택(REST API, 서비스 role/anon 키 양쪽 curl로 재현) 응답으로 검증한 결과 실제로는
 * **WKB hex 문자열**("0101000020E6100000...")로 온다 — GeoJSON 분기는 이 환경에서 한 번도
 * 실행되지 않는 죽은 코드였다(대시보드 지도 목록에 방금 만든 테스트 주문이 전혀 뜨지 않는
 * 것으로 먼저 재현: parsePoint류 함수가 null을 반환해 `.filter(v => v !== null)`로 조용히
 * 걸러짐 — 에러 없이 실패해 눈에 띄지 않았다). WKB 헤더(1B endianness + 4B geom type + 4B SRID)
 * 이후 8B lng + 8B lat(double, 헤더의 endianness) 리틀/빅엔디안 모두 지원하도록 파싱하고,
 * GeoJSON 객체 형태도 함께 지원해 향후 PostgREST 버전이 바뀌어도 둘 다 커버한다.
 */
function parseGeographyPoint(raw: unknown): { lat: number; lng: number } | null {
  if (!raw) return null;

  if (typeof raw === "object" && "coordinates" in raw) {
    const coords = (raw as { coordinates: [number, number] }).coordinates;
    return { lat: coords[1], lng: coords[0] };
  }

  if (typeof raw === "string" && /^[0-9a-fA-F]+$/.test(raw) && raw.length >= 50) {
    try {
      const byteLen = raw.length / 2;
      const buf = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        buf[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
      }
      const littleEndian = buf[0] === 1;
      const view = new DataView(buf.buffer);
      // 헤더: 1B endianness + 4B geom type + 4B SRID = 9바이트, 이후 lng(8B) + lat(8B).
      const lng = view.getFloat64(9, littleEndian);
      const lat = view.getFloat64(17, littleEndian);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  return null;
}

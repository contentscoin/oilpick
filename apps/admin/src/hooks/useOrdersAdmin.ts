import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import type { OrderStatus } from "@oilpick/core";

/**
 * supplier_id/rider_id → store_name/vehicle_number 매핑. PostgREST의 임베드(join) 문법은
 * FK 제약 이름(예: pickup_orders_supplier_id_fkey)에 의존하는데 01-db-schema.sql은 인라인
 * `references`로 제약을 선언해 이름이 Postgres 기본 명명 규칙에 암묵적으로 의존한다 — 이를
 * 직접 가정하는 대신 profiles/supplier_profiles/rider_profiles를 별도 조회해 Map으로 join하는
 * 더 견고한 방식을 쓴다(admin은 is_admin() RLS로 두 테이블 모두 전체 read 가능, 01-db-schema.sql
 * p_sup_self/p_rider_self "id = auth.uid() or is_admin()").
 */
async function fetchNameMaps(): Promise<{
  supplierNames: Map<string, string>;
  riderNames: Map<string, string>;
}> {
  const [suppliersRes, ridersRes] = await Promise.all([
    supabase.from("supplier_profiles").select("id, store_name"),
    supabase.from("rider_profiles").select("id, vehicle_number"),
  ]);
  const supplierNames = new Map<string, string>(
    (suppliersRes.data ?? []).map((s) => [s.id as string, s.store_name as string]),
  );
  const riderNames = new Map<string, string>(
    (ridersRes.data ?? []).map((r) => [r.id as string, r.vehicle_number as string]),
  );
  return { supplierNames, riderNames };
}

export interface AdminOrderRow {
  id: string;
  status: OrderStatus;
  supplierId: string;
  supplierName: string;
  riderId: string | null;
  riderName: string | null;
  requestedKg: number;
  measuredKg: number | null;
  finalKg: number | null;
  /** [14 J2] null=레거시=PICKUP. 중재 시 배달 통수 정정 필드 노출 여부 판단에 쓴다. */
  orderKind: "PICKUP" | "PURCHASE" | "MIXED" | null;
  deliveredCans: number | null;
  pickupAddress: string;
  createdAt: string;
  /**
   * 07 F12-⑤: ARRIVED 진입 시각(order_events to_status='ARRIVED'의 최신 시각). pickup_orders에는
   * arrived_at 컬럼이 없어(init.sql) 이벤트에서 조회한다. ARRIVED가 아니거나 이벤트가 없으면 null.
   * 24h 초과 체류 하이라이트(교착 조기 감지, 07 §1-3)의 기준 타임스탬프.
   */
  arrivedAt: string | null;
}

/**
 * 03-frontend.md apps/admin "/orders": "테이블(상태 필터)". statusFilter가 "ALL"이면 전체.
 * 06 E10-①: created_at 날짜 범위(dateFrom/dateTo, YYYY-MM-DD, 빈 문자열=미적용)는 서버 쿼리
 * 파라미터(.gte/.lt)로 필터한다 — 페이지 단위(50건) 서버 조회라 클라이언트 필터로는 페이지
 * 밖의 과거 주문에 닿을 수 없다(RLS/뷰 변경 없음). 경계는 브라우저 로컬 자정 기준 — 목록의
 * toLocaleString 표시와 같은 타임존으로 맞춘다(created_at은 timestamptz).
 */
/** 06 E10-① 시작 경계: 시작일 로컬 자정(포함). 목록 toLocaleString 표시와 동일 타임존 기준. */
export function dateFromBoundaryIso(dateFrom: string): string {
  return new Date(`${dateFrom}T00:00:00`).toISOString();
}

/** 06 E10-① 종료 경계(배타 상한): 종료일 "다음날" 로컬 자정 — .lt와 짝지어 종료일 전체를 포함시킨다. */
export function dateToExclusiveBoundaryIso(dateTo: string): string {
  return new Date(new Date(`${dateTo}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/** 05 폴리시 패스 "admin 테이블 정렬/페이지네이션": 서버 페이지네이션 페이지 크기. */
export const ADMIN_ORDERS_PAGE_SIZE = 50;

/** 정렬 가능 컬럼 = 요청일(created_at)·예상 kg(requested_kg). 서버 .order로 반영한다. */
export type AdminOrdersSortColumn = "created_at" | "requested_kg";

export interface AdminOrdersSort {
  column: AdminOrdersSortColumn;
  ascending: boolean;
}

/** 기본 정렬: 요청일 최신순(기존 limit(200) 시절과 동일한 순서). */
export const DEFAULT_ADMIN_ORDERS_SORT: AdminOrdersSort = { column: "created_at", ascending: false };

export interface AdminOrdersPage {
  rows: AdminOrderRow[];
  hasNextPage: boolean;
}

/**
 * useAdminOrders의 queryFn 본체. 훅에서 분리해 supabase 모킹만으로 단위 테스트한다.
 * hasNextPage 판별: 페이지 크기+1(51)건을 요청해 초과분 존재 여부로 판단 — { count: "exact" }
 * head 카운트보다 요청 1번에 끝나고 서버 카운트 비용도 없어 더 단순하다(user 앱
 * useOrderHistory와 같은 관용구). 초과 1건은 slice로 버린다.
 */
export async function fetchAdminOrders(
  statusFilter: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  sort: AdminOrdersSort,
): Promise<AdminOrdersPage> {
  const from = page * ADMIN_ORDERS_PAGE_SIZE;
  let q = supabase
    .from("pickup_orders")
    .select("id, status, supplier_id, rider_id, requested_kg, measured_kg, final_kg, pickup_address, created_at, order_kind, delivered_cans")
    .order(sort.column, { ascending: sort.ascending })
    // 동률(같은 kg·같은 시각)에서 페이지 간 행 중복/누락이 없도록 id로 순서를 고정한다.
    .order("id", { ascending: true })
    .range(from, from + ADMIN_ORDERS_PAGE_SIZE); // 페이지 크기+1건 — hasNextPage 판별용
  if (statusFilter !== "ALL") {
    q = q.eq("status", statusFilter);
  }
  // 시작일 로컬 자정 이상 ~ 종료일 다음날 로컬 자정 미만(종료일 포함).
  if (dateFrom) {
    q = q.gte("created_at", dateFromBoundaryIso(dateFrom));
  }
  if (dateTo) {
    q = q.lt("created_at", dateToExclusiveBoundaryIso(dateTo));
  }
  const [{ data, error }, { supplierNames, riderNames }] = await Promise.all([q, fetchNameMaps()]);
  if (error) throw error;
  const fetched = data ?? [];
  const hasNextPage = fetched.length > ADMIN_ORDERS_PAGE_SIZE;
  const rows = fetched.slice(0, ADMIN_ORDERS_PAGE_SIZE);

  // 07 F12-⑤: ARRIVED 주문의 진입 시각을 order_events에서 조회(pickup_orders엔 arrived_at 없음).
  // ARRIVED 행이 있을 때만 추가 조회한다. 같은 주문에 ARRIVE 이벤트가 여러 개면 최신을 취한다.
  const arrivedIds = rows.filter((r) => r.status === "ARRIVED").map((r) => r.id);
  const arrivedAtMap = new Map<string, string>();
  if (arrivedIds.length > 0) {
    const { data: evs } = await supabase
      .from("order_events")
      .select("order_id, created_at")
      .eq("to_status", "ARRIVED")
      .in("order_id", arrivedIds)
      .order("created_at", { ascending: false });
    for (const ev of evs ?? []) {
      if (!arrivedAtMap.has(ev.order_id)) arrivedAtMap.set(ev.order_id, ev.created_at);
    }
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      status: row.status,
      supplierId: row.supplier_id,
      supplierName: supplierNames.get(row.supplier_id) ?? row.supplier_id.slice(0, 8),
      riderId: row.rider_id,
      riderName: row.rider_id ? (riderNames.get(row.rider_id) ?? row.rider_id.slice(0, 8)) : null,
      requestedKg: Number(row.requested_kg),
      measuredKg: row.measured_kg !== null ? Number(row.measured_kg) : null,
      finalKg: row.final_kg !== null ? Number(row.final_kg) : null,
      orderKind: (row.order_kind as "PICKUP" | "PURCHASE" | "MIXED" | null) ?? null,
      deliveredCans: row.delivered_cans !== null && row.delivered_cans !== undefined ? Number(row.delivered_cans) : null,
      pickupAddress: row.pickup_address,
      createdAt: row.created_at,
      arrivedAt: arrivedAtMap.get(row.id) ?? null,
    })),
    hasNextPage,
  };
}

export function useAdminOrders(
  statusFilter: string,
  dateFrom = "",
  dateTo = "",
  page = 0,
  sort: AdminOrdersSort = DEFAULT_ADMIN_ORDERS_SORT,
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    // 날짜 범위·페이지·정렬은 statusFilter와 같은 방식으로 queryKey에 포함한다. queryKeys.orders
    // 프리픽스를 유지해 Realtime invalidate(["admin", "orders"]) 대상에 남긴다.
    queryKey: [...queryKeys.orders(statusFilter), dateFrom, dateTo, page, sort.column, sort.ascending],
    queryFn: () => fetchAdminOrders(statusFilter, dateFrom, dateTo, page, sort),
    // 페이지/정렬 전환 시 이전 페이지 rows·hasNextPage를 유지 — 없으면 매 전환마다 tbody가
    // 로딩 행으로 붕괴하고, 방금 누른 이전/다음 버튼이 disabled로 바뀌며 키보드 포커스가
    // body로 떨어진다(2026-07-11 리뷰 확정 발견).
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_orders_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface AdminOrderEvent {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** 03-frontend.md apps/admin "/orders": "상세 드로어(이벤트 타임라인, 사진)". */
export function useAdminOrderEvents(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderEvents(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<AdminOrderEvent[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_events")
        .select("id, from_status, to_status, actor_id, payload, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        actorId: row.actor_id,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdAt: row.created_at,
      }));
    },
  });
}

// arrivedAt은 목록 하이라이트(07 F12-⑤) 전용이라 상세에는 포함하지 않는다(드로어는 24h 하이라이트 미사용).
export interface AdminOrderDetail extends Omit<AdminOrderRow, "arrivedAt"> {
  measuredKg: number | null;
  photoUrls: string[];
  disputeReason: string | null;
  cancelReason: string | null;
  snapshotPricePerKg: number;
  /** 07 F10-⑤: 소진 쿠폰 장수(주문 생성 시 스냅샷). 레거시 주문은 null. */
  couponCost: number | null;
  /** [08 P2] 현장 지급수단. null=레거시(완료 표시는 CASH 간주 — 08 P3). */
  payoutMethod: "CASH" | "POINT" | null;
  /** 07 F10-⑤: 완료 시 지급된 현금(round(final_kg×snapshot_price)). 미완료 null. */
  cashPaidAmount: number | null;
  completedAt: string | null;
  /** 07 F10-⑤: 이 주문에 대한 쿠폰 환급(REFUND 원장) 존재 여부. 귀책 취소 시 true. */
  refunded: boolean;
}

export function useAdminOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orderDetail(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<AdminOrderDetail | null> => {
      if (!orderId) return null;
      const [{ data, error }, { supplierNames, riderNames }, refundRes] = await Promise.all([
        supabase
          .from("pickup_orders")
          .select(
            "id, status, supplier_id, rider_id, requested_kg, final_kg, measured_kg, photo_urls, dispute_reason, cancel_reason, pickup_address, created_at, snapshot_price_per_kg, coupon_cost, payout_method, cash_paid_amount, completed_at, order_kind, delivered_cans",
          )
          .eq("id", orderId)
          .maybeSingle(),
        fetchNameMaps(),
        // 귀책 환급(REFUND) 여부 — coupon_ledger에서 이 주문의 REFUND 원장을 admin RLS로 조회.
        supabase
          .from("coupon_ledger")
          .select("id")
          .eq("order_id", orderId)
          .eq("entry_type", "REFUND")
          .limit(1),
      ]);
      if (error) throw error;
      if (refundRes.error) throw refundRes.error;
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        supplierId: data.supplier_id,
        supplierName: supplierNames.get(data.supplier_id) ?? data.supplier_id.slice(0, 8),
        riderId: data.rider_id,
        riderName: data.rider_id ? (riderNames.get(data.rider_id) ?? data.rider_id.slice(0, 8)) : null,
        requestedKg: Number(data.requested_kg),
        finalKg: data.final_kg !== null ? Number(data.final_kg) : null,
        orderKind: (data.order_kind as "PICKUP" | "PURCHASE" | "MIXED" | null) ?? null,
        deliveredCans: data.delivered_cans !== null && data.delivered_cans !== undefined ? Number(data.delivered_cans) : null,
        measuredKg: data.measured_kg !== null ? Number(data.measured_kg) : null,
        photoUrls: data.photo_urls ?? [],
        disputeReason: data.dispute_reason,
        cancelReason: data.cancel_reason,
        pickupAddress: data.pickup_address,
        createdAt: data.created_at,
        snapshotPricePerKg: data.snapshot_price_per_kg,
        couponCost: data.coupon_cost !== null && data.coupon_cost !== undefined ? Number(data.coupon_cost) : null,
        payoutMethod: (data.payout_method ?? null) as "CASH" | "POINT" | null,
        cashPaidAmount:
          data.cash_paid_amount !== null && data.cash_paid_amount !== undefined ? Number(data.cash_paid_amount) : null,
        completedAt: data.completed_at ?? null,
        refunded: (refundRes.data ?? []).length > 0,
      };
    },
  });
}

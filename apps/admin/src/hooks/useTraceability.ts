import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderKind, OrderStatus, PayoutMethod } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

/**
 * [19 T7] 폐식용유 바코드 유통이력. docs/spec/19-admin-console.md §1 T7.
 *
 * 바코드 = 폐식용유 용기(말통)의 식별자. 같은 바코드가 회차를 달리해 여러 주문에 등장하므로
 * "유통이력"은 바코드 1개의 회수 이벤트 시계열이다. 소비 릴레이션은 20260806000004가 만든
 * v_barcode_summary(목록·검색) / v_barcode_trace(상세 타임라인) 둘 다 security_invoker —
 * 행 범위는 기저 RLS가 강제한다(admin 전용 메뉴, 19 §1 T2).
 */

export const TRACE_PAGE_SIZE = 50;

export interface BarcodeSummaryRow {
  barcode: string;
  pickupCount: number;
  orderCount: number;
  riderCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastOrderId: string | null;
  lastRiderId: string | null;
}

export interface BarcodeSummaryPage {
  rows: BarcodeSummaryRow[];
  hasNextPage: boolean;
}

/**
 * 바코드 목록(최근 회수순) + 부분일치 검색 + 기간 필터.
 * 검색어는 서버 ilike(뷰 컬럼 barcode) — 클라이언트 필터로는 페이지 밖 바코드에 닿을 수 없다.
 * hasNextPage는 페이지 크기+1건 요청으로 판별한다(useOrdersAdmin과 같은 관용구).
 */
export async function fetchBarcodeSummaries(
  keyword: string,
  dateFrom: string,
  dateTo: string,
  page: number,
): Promise<BarcodeSummaryPage> {
  const from = page * TRACE_PAGE_SIZE;
  let q = supabase
    .from("v_barcode_summary")
    .select("barcode, pickup_count, order_count, rider_count, first_seen_at, last_seen_at, last_order_id, last_rider_id")
    .order("last_seen_at", { ascending: false })
    // 동률(같은 시각) 페이지 경계에서 행이 중복/누락되지 않게 바코드로 순서를 고정한다.
    .order("barcode", { ascending: true })
    .range(from, from + TRACE_PAGE_SIZE);
  const trimmed = keyword.trim();
  if (trimmed) {
    // %·_는 LIKE 와일드카드라 그대로 넣으면 의도치 않게 넓게 매칭된다 — 이스케이프한다.
    q = q.ilike("barcode", `%${trimmed.replace(/[%_]/g, (c) => `\\${c}`)}%`);
  }
  // 경계는 브라우저 로컬 자정 기준(목록 표시 toLocaleString과 같은 타임존).
  if (dateFrom) q = q.gte("last_seen_at", new Date(`${dateFrom}T00:00:00`).toISOString());
  if (dateTo) {
    q = q.lt("last_seen_at", new Date(new Date(`${dateTo}T00:00:00`).getTime() + 86_400_000).toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;
  const fetched = data ?? [];
  const hasNextPage = fetched.length > TRACE_PAGE_SIZE;
  return {
    rows: fetched.slice(0, TRACE_PAGE_SIZE).map((r) => ({
      barcode: r.barcode as string,
      pickupCount: Number(r.pickup_count ?? 0),
      orderCount: Number(r.order_count ?? 0),
      riderCount: Number(r.rider_count ?? 0),
      firstSeenAt: (r.first_seen_at as string | null) ?? null,
      lastSeenAt: (r.last_seen_at as string | null) ?? null,
      lastOrderId: (r.last_order_id as string | null) ?? null,
      lastRiderId: (r.last_rider_id as string | null) ?? null,
    })),
    hasNextPage,
  };
}

export function useBarcodeSummaries(keyword: string, dateFrom: string, dateTo: string, page: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "trace", "summary", keyword, dateFrom, dateTo, page],
    queryFn: () => fetchBarcodeSummaries(keyword, dateFrom, dateTo, page),
    // 페이지 전환 시 목록이 로딩 행으로 붕괴하지 않게 이전 페이지를 유지한다.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_trace_items")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "trace"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface BarcodeTraceRow {
  barcode: string;
  itemId: number;
  orderId: string;
  riderId: string | null;
  riderName: string | null;
  vehicleNumber: string | null;
  supplierId: string | null;
  storeName: string | null;
  pickupAddress: string | null;
  dealerId: string | null;
  dealerName: string | null;
  orderStatus: OrderStatus;
  orderKind: OrderKind | null;
  measuredKg: number | null;
  finalKg: number | null;
  payoutMethod: PayoutMethod | null;
  cashPaidAmount: number | null;
  purchaseAmount: number | null;
  netAmount: number | null;
  dealerSettlementId: string | null;
  settlementStatus: string | null;
  photoUrl: string | null;
  geoLat: number | null;
  geoLng: number | null;
  capturedAt: string | null;
  recordedAt: string;
  seenAt: string;
  completedAt: string | null;
}

function mapTraceRow(r: Record<string, unknown>): BarcodeTraceRow {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    barcode: r.barcode as string,
    itemId: Number(r.item_id),
    orderId: r.order_id as string,
    riderId: (r.rider_id as string | null) ?? null,
    riderName: (r.rider_name as string | null) ?? null,
    vehicleNumber: (r.vehicle_number as string | null) ?? null,
    supplierId: (r.supplier_id as string | null) ?? null,
    storeName: (r.store_name as string | null) ?? null,
    pickupAddress: (r.pickup_address as string | null) ?? null,
    dealerId: (r.dealer_id as string | null) ?? null,
    dealerName: (r.dealer_name as string | null) ?? null,
    orderStatus: r.order_status as OrderStatus,
    orderKind: (r.order_kind as OrderKind | null) ?? null,
    measuredKg: num(r.measured_kg),
    finalKg: num(r.final_kg),
    payoutMethod: (r.payout_method as PayoutMethod | null) ?? null,
    cashPaidAmount: num(r.cash_paid_amount),
    purchaseAmount: num(r.purchase_amount),
    netAmount: num(r.net_amount),
    dealerSettlementId: (r.dealer_settlement_id as string | null) ?? null,
    settlementStatus: (r.settlement_status as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    geoLat: num(r.geo_lat),
    geoLng: num(r.geo_lng),
    capturedAt: (r.captured_at as string | null) ?? null,
    recordedAt: r.recorded_at as string,
    seenAt: r.seen_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

/** 바코드 1개의 회수 이력(최신 회차 → 과거). 선택된 바코드가 없으면 조회하지 않는다. */
export function useBarcodeTrace(barcode: string | null) {
  return useQuery({
    queryKey: ["admin", "trace", "detail", barcode ?? ""],
    enabled: Boolean(barcode),
    queryFn: async (): Promise<BarcodeTraceRow[]> => {
      if (!barcode) return [];
      const { data, error } = await supabase
        .from("v_barcode_trace")
        .select("*")
        .eq("barcode", barcode)
        .order("seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapTraceRow(r as Record<string, unknown>));
    },
  });
}

/**
 * 주문 1건에 등록된 바코드 목록 — 주문 상세에서 `/traceability?order=<id>`로 넘어온 진입점.
 * 주문 축으로 들어와도 화면은 같은 이력 뷰를 쓴다(축만 다르고 데이터 원천은 하나).
 */
export function useOrderBarcodes(orderId: string | null) {
  return useQuery({
    queryKey: ["admin", "trace", "order", orderId ?? ""],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<BarcodeTraceRow[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("v_barcode_trace")
        .select("*")
        .eq("order_id", orderId)
        .order("seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapTraceRow(r as Record<string, unknown>));
    },
  });
}

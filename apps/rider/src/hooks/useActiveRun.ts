import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_RIDER_ACTIVE_ORDERS,
  parseEwkbPoint,
  parseGeographyPoint,
  type OrderKind,
  type OrderStatus,
  type PayoutMethod,
} from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface ActiveRun {
  id: string;
  status: OrderStatus;
  supplierId: string;
  depotId: string | null;
  pickupAddress: string;
  /** 수거지 좌표(pickup_location EWKB 파싱, 11 M9-a) — 지도 센터·내비 딥링크용. 파싱 실패 시 null. */
  pickupLat: number | null;
  pickupLng: number | null;
  requestedKg: number;
  /** [N5] 점주 희망 시간 — 'YYYY-MM-DD HH:mm' 또는 레거시 '지금'. 저장 문자열 그대로 표시. */
  preferredTime: string | null;
  /** [14 J2] 주문 종류(PICKUP/PURCHASE/MIXED). null=레거시=PICKUP. */
  orderKind: OrderKind | null;
  /** [14 J2] 신청 신유 통수·통당가 스냅샷 — deliveredCans 프리필·상계 미리보기. */
  purchaseRequestedCans: number | null;
  snapshotFreshCanPrice: number | null;
  measuredKg: number | null;
  /** 확정(중재 반영) 무게. 07 §1-3: RESOLVE_DISPUTE가 기록하면 ARRIVED 복귀 + 재제출 불가 마킹. */
  finalKg: number | null;
  photoUrls: string[];
  snapshotPricePerKg: number;
  snapshotRiderFee: number;
  /**
   * 현장 지급수단(08 P2). SUBMIT_MEASURE에서 라이더가 선택 — 재제출 프리필·대기/완료 카피 분기에
   * 사용한다. 계량 제출 전·레거시 주문은 null(완료 표시는 CASH 간주 — 08 P3 coalesce).
   */
  payoutMethod: PayoutMethod | null;
  /** 확정 지급액(원). POINT 지급도 이 컬럼에 기록(1P=1원, 08 P3). COMPLETED에서만 채워짐. */
  /** [14 J2] 폐유 총액(gross) 동결값 — 실지급액은 netAmount. */
  cashPaidAmount: number | null;
  purchaseAmount: number | null;
  /** 상계 순액. 양수=라이더가 점주에게 지급, 음수=라이더가 점주에게 받음. 레거시는 null. */
  netAmount: number | null;
  completedAt: string | null;
  createdAt: string;
  /** 06 E8-④ [사장님께 전화]: 배정 주문 supplier의 전화/상호. RLS 정책
   * p_profiles_read_assigned_supplier(20260709000011)가 없거나 조회 실패 시 null(버튼 미렌더). */
  supplierPhone: string | null;
  supplierName: string | null;
}

// [N5] preferred_time 추가 — 운행 화면 상단 희망 시간 표시.
const RUN_COLUMNS =
  "id, status, supplier_id, depot_id, pickup_address, pickup_location, requested_kg, preferred_time, order_kind, purchase_requested_cans, snapshot_fresh_can_price, delivered_cans, purchase_amount, net_amount, measured_kg, final_kg, photo_urls, snapshot_price_per_kg, snapshot_rider_fee, payout_method, cash_paid_amount, completed_at, created_at";

/**
 * 진행중으로 취급하는 상태(07 F6-②③④).
 * - DISPUTED: 분쟁 안내 패널을 위해 포함(예전엔 빠져 라이더가 빈 화면+수수께끼 409에 갇혔다).
 * - COMPLETED: "수거 완료 — 현금 지급" 요약 화면을 위해 포함하되, 최근 완료분만 노출한다
 *   (COMPLETED_SUMMARY_WINDOW_MS 경과분은 queryFn에서 null 처리 → EmptyState로 콜홈 유도).
 *   라이더 단일 활성주문 불변식(idx_rider_single_active_order) 덕에, 활성 주문이 있으면
 *   그 주문이 항상 created_at 최신이라 stale COMPLETED가 활성 주문을 가리지 않는다.
 */
const RUN_STATUSES: OrderStatus[] = ["ACCEPTED", "ARRIVED", "PICKED_UP", "DISPUTED", "COMPLETED"];

/** COMPLETED 요약을 "완료 직후"로 한정하는 창(07 F6-④, 스펙 미명시 — 보고). */
const COMPLETED_SUMMARY_WINDOW_MS = 30 * 60 * 1000;

function mapRow(row: {
  id: string;
  status: OrderStatus;
  supplier_id: string;
  depot_id: string | null;
  pickup_address: string;
  pickup_location: string | null;
  requested_kg: number;
  preferred_time?: string | null;
  order_kind: OrderKind | null;
  purchase_requested_cans: number | null;
  snapshot_fresh_can_price: number | null;
  delivered_cans: number | null;
  measured_kg: number | null;
  final_kg: number | null;
  photo_urls: string[];
  snapshot_price_per_kg: number;
  snapshot_rider_fee: number;
  payout_method: PayoutMethod | null;
  cash_paid_amount: number | null;
  purchase_amount: number | null;
  net_amount: number | null;
  completed_at: string | null;
  created_at: string;
}): Omit<ActiveRun, "supplierPhone" | "supplierName"> {
  const pickupPoint = parseEwkbPoint(row.pickup_location);
  return {
    id: row.id,
    status: row.status,
    supplierId: row.supplier_id,
    depotId: row.depot_id,
    pickupAddress: row.pickup_address,
    pickupLat: pickupPoint?.lat ?? null,
    pickupLng: pickupPoint?.lng ?? null,
    requestedKg: row.requested_kg,
    preferredTime: row.preferred_time ?? null,
    orderKind: row.order_kind,
    purchaseRequestedCans: row.purchase_requested_cans,
    snapshotFreshCanPrice: row.snapshot_fresh_can_price,
    measuredKg: row.measured_kg,
    finalKg: row.final_kg,
    photoUrls: row.photo_urls ?? [],
    snapshotPricePerKg: row.snapshot_price_per_kg,
    snapshotRiderFee: row.snapshot_rider_fee,
    payoutMethod: row.payout_method ?? null,
    cashPaidAmount: row.cash_paid_amount ?? null,
    purchaseAmount: row.purchase_amount ?? null,
    netAmount: row.net_amount ?? null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/**
 * 활성 주문 목록에서 화면에 띄울 한 건을 고른다. selectedOrderId가 목록에 있으면 그것,
 * 없으면(미선택·이미 종결) 가장 최근 건. 목록이 비면 null.
 */
function pickRun<T extends { id: string }>(rows: T[], selectedOrderId?: string): T | null {
  if (rows.length === 0) return null;
  if (selectedOrderId) {
    const hit = rows.find((r) => r.id === selectedOrderId);
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

/** 런 전환기용 경량 요약. 전체 런(+supplier 조회)을 N번 돌리지 않으려고 분리했다. */
export interface ActiveRunSummary {
  id: string;
  status: OrderStatus;
  pickupAddress: string;
  /** [16 L3 §3-3] 수거지 좌표 — 전환기 거리 칩·권장 방문 순서용. 파싱 실패 시 null(거리 미표기, 12 §S1 규약). */
  pickupLat: number | null;
  pickupLng: number | null;
  createdAt: string;
}

/**
 * 진행 중인 운행 **목록**(최대 MAX_RIDER_ACTIVE_ORDERS건). ActiveRunPage 상단 전환기가 쓴다.
 * 완료 직후 요약 창(COMPLETED)은 useActiveRun과 달리 목록에서 제외한다 — 전환 대상이 아니다.
 */
export function useActiveRunSummaries(riderId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.activeRun(riderId ?? ""), "summaries"],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<ActiveRunSummary[]> => {
      if (!riderId) return [];
      const { data, error } = await supabase
        .from("pickup_orders")
        // [16 L3 §3-3] pickup_location 추가 — 본인 배정 주문은 기존 RLS로 전 컬럼 조회 가능(서버 변경 0).
        .select("id, status, pickup_address, pickup_location, created_at")
        .eq("rider_id", riderId)
        .in("status", ["ACCEPTED", "ARRIVED", "PICKED_UP", "DISPUTED"])
        .order("created_at", { ascending: false })
        .limit(MAX_RIDER_ACTIVE_ORDERS + 1);
      if (error) throw error;
      return (data ?? []).map((r) => {
        // S1 단일 파서(hex EWKB·GeoJSON 겸용, 실패 시 null 강등 — 12 §S1).
        const point = parseGeographyPoint(r.pickup_location);
        return {
          id: r.id as string,
          status: r.status as OrderStatus,
          pickupAddress: (r.pickup_address as string) ?? "",
          pickupLat: point?.lat ?? null,
          pickupLng: point?.lng ?? null,
          createdAt: r.created_at as string,
        };
      });
    },
  });
}

/**
 * R4~R6 "/active" 운행 화면이 쓰는, 배정된 라이더 본인의 진행중(ACCEPTED~PICKED_UP) 주문 조회
 * + Realtime 구독(03-frontend.md apps/rider 표: "status 분기").
 * [다중 콜] 활성 주문이 여러 건일 수 있으므로 `selectedOrderId`로 표시 대상을 고른다.
 */
export function useActiveRun(riderId: string | undefined, selectedOrderId?: string) {
  const queryClient = useQueryClient();
  const queryKey = [...queryKeys.activeRun(riderId ?? ""), selectedOrderId ?? "latest"];

  const query = useQuery({
    queryKey,
    enabled: Boolean(riderId),
    queryFn: async (): Promise<ActiveRun | null> => {
      if (!riderId) return null;
      // [다중 콜] 활성 주문이 최대 3건이 될 수 있다. 가장 최근 것 하나만 집어오면 나머지가
      // 화면에서 사라져 라이더가 완료 처리를 못 하고 갇힌다 — 목록으로 받아 호출부가 고른다.
      const { data: rows, error } = await supabase
        .from("pickup_orders")
        .select(RUN_COLUMNS)
        .eq("rider_id", riderId)
        .in("status", RUN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(MAX_RIDER_ACTIVE_ORDERS + 1);
      if (error) throw error;
      const data = pickRun(rows ?? [], selectedOrderId);
      if (!data) return null;
      const run = mapRow(data);
      // 07 F6-④: 오래된 완료분은 활성 운행으로 취급하지 않는다(완료 직후 요약만 노출).
      if (run.status === "COMPLETED") {
        const completedMs = run.completedAt ? new Date(run.completedAt).getTime() : 0;
        if (!completedMs || Date.now() - completedMs > COMPLETED_SUMMARY_WINDOW_MS) return null;
      }

      // 06 E8-④: [사장님께 전화]용 supplier 전화/상호. profiles 조인 대신 2쿼리
      // (apps/user useAssignedRiderCard.ts의 역방향 — RLS p_profiles_read_assigned_supplier,
      // 20260709000011). 전화 버튼은 부가 기능이므로 조회 실패는 운행 화면을 깨지 않고
      // null(버튼 미렌더)로 강등한다.
      let supplierPhone: string | null = null;
      let supplierName: string | null = null;
      const { data: supplier, error: supplierError } = await supabase
        .from("profiles")
        .select("display_name, phone")
        .eq("id", run.supplierId)
        .maybeSingle();
      if (!supplierError && supplier) {
        supplierPhone = supplier.phone ?? null;
        supplierName = supplier.display_name ?? null;
      }

      return { ...run, supplierPhone, supplierName };
    },
  });

  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`pickup_orders_rider_${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_orders",
          filter: `rider_id=eq.${riderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.activeRun(riderId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKeys.activeRun(riderId)는 매 렌더 새 배열을 반환하므로 deps에는 riderId만 사용한다
    // (apps/user useActiveOrder.ts와 동일 패턴).
  }, [riderId, queryClient]);

  return query;
}

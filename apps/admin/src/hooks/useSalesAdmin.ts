import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import type { CouponSalesDailyRow } from "../lib/couponSales";

/**
 * 07 F10-③ "매출·정산" 재편 데이터 훅. 구모델의 useSettlementAdmin(출금 큐/point_ledger)을 대체한다
 * (해당 파일은 라우트 참조 0으로 남고 F13에서 삭제). 쿠폰 매출·수거 추이는 admin 전용 집계 뷰
 * (v_coupon_sales_daily / v_pickup_stats_daily — is_admin 게이트)로, 원장 감사·결제 목록은
 * coupon_ledger / coupon_purchases 직접 조회로 구성한다.
 */

/** rider_id → display_name 매핑(useSettlementAdmin.fetchDisplayNameMap와 동일 이유 — 임베드 미사용). */
async function fetchDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

function sinceIso(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().slice(0, 10);
}

/** 쿠폰 매출 대시(v_coupon_sales_daily). 일별 판매액/장수/환불 구분. 최근 days일. */
export function useCouponSalesDaily(days = 14) {
  return useQuery({
    queryKey: queryKeys.couponSalesDaily(days),
    queryFn: async (): Promise<CouponSalesDailyRow[]> => {
      const { data, error } = await supabase
        .from("v_coupon_sales_daily")
        .select("day, charged_qty, sales_amount, refund_qty, pg_refund_qty, manual_adjust_qty")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        day: row.day,
        chargedQty: Number(row.charged_qty ?? 0),
        salesAmount: Number(row.sales_amount ?? 0),
        refundQty: Number(row.refund_qty ?? 0),
        pgRefundQty: Number(row.pg_refund_qty ?? 0),
        manualAdjustQty: Number(row.manual_adjust_qty ?? 0),
      }));
    },
  });
}

export interface PickupStatsDailyRow {
  day: string;
  completedCount: number;
  totalKg: number;
  totalCash: number;
}

/** 수거 활동 추이(v_pickup_stats_daily). 일별 완료건수/kg/현금 거래액(completed_at 기준). 최근 days일. */
export function usePickupStatsDaily(days = 14) {
  return useQuery({
    queryKey: queryKeys.pickupStatsDaily(days),
    queryFn: async (): Promise<PickupStatsDailyRow[]> => {
      const { data, error } = await supabase
        .from("v_pickup_stats_daily")
        .select("day, completed_count, total_kg, total_cash")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        day: row.day,
        completedCount: Number(row.completed_count ?? 0),
        totalKg: Number(row.total_kg ?? 0),
        totalCash: Number(row.total_cash ?? 0),
      }));
    },
  });
}

export interface CouponLedgerAuditRow {
  id: number;
  riderId: string;
  riderName: string;
  entryType: "CHARGE" | "CONSUME" | "REFUND" | "ADJUST";
  qty: number;
  unitPrice: number | null;
  orderId: string | null;
  purchaseId: string | null;
  memo: string | null;
  createdAt: string;
}

/** 쿠폰 원장 감사 테이블(최근 limit건). append-only coupon_ledger 직접 조회 + 라이더명 join. */
export function useCouponLedgerAudit(limit = 100) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.couponLedgerAudit(limit),
    queryFn: async (): Promise<CouponLedgerAuditRow[]> => {
      const { data, error } = await supabase
        .from("coupon_ledger")
        .select("id, rider_id, entry_type, qty, unit_price, order_id, purchase_id, memo, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.rider_id as string));
      return (data ?? []).map((row) => ({
        id: row.id,
        riderId: row.rider_id,
        riderName: nameMap.get(row.rider_id) ?? (row.rider_id as string).slice(0, 8),
        entryType: row.entry_type,
        qty: row.qty,
        unitPrice: row.unit_price,
        orderId: row.order_id,
        purchaseId: row.purchase_id,
        memo: row.memo,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_coupon_ledger_audit")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "coupon_ledger" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "sales"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface CouponPurchaseRow {
  id: string;
  riderId: string;
  riderName: string;
  qty: number;
  unitPrice: number;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED";
  pgOrderId: string;
  paymentKey: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** 쿠폰 결제 목록(coupon_purchases). status 필터(EXPIRED 대사 포함). 환불 처리 대상. */
export function useCouponPurchases(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.couponPurchases(statusFilter),
    queryFn: async (): Promise<CouponPurchaseRow[]> => {
      let q = supabase
        .from("coupon_purchases")
        .select("id, rider_id, qty, unit_price, amount, status, pg_order_id, payment_key, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.rider_id as string));
      return (data ?? []).map((row) => ({
        id: row.id,
        riderId: row.rider_id,
        riderName: nameMap.get(row.rider_id) ?? (row.rider_id as string).slice(0, 8),
        qty: row.qty,
        unitPrice: row.unit_price,
        amount: row.amount,
        status: row.status,
        pgOrderId: row.pg_order_id,
        paymentKey: row.payment_key,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_coupon_purchases")
      .on("postgres_changes", { event: "*", schema: "public", table: "coupon_purchases" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "sales", "couponPurchases"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

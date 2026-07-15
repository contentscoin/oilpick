import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * 08 G7-① "정산" 재편 데이터 훅 — 07 F10의 useSalesAdmin(쿠폰 매출/결제)을 대체한다(쿠폰 모델 폐기).
 *  - 출금 큐: withdrawals 직접 조회(RLS: admin 전체 read) + withdraw-process Edge Function으로 처리.
 *  - 포인트 원장 감사: point_ledger 직접 조회(append-only) + 이름 join.
 *  - 라이더별 지급 실적: v_rider_payout_daily(admin 게이트 뷰) → 라이더 단위 합산.
 *    포인트 지급분은 플랫폼이 점주에게 부담(EARN)하므로 이 표가 라이더-플랫폼 오프라인 정산의
 *    유일한 대사 근거다(08 P5).
 *  - 수거 활동 추이: v_pickup_stats_daily — 08에서 cash_amount/point_amount 분리 컬럼 추가.
 */

/** user_id → display_name 매핑(임베드 미사용 — 기존 useSalesAdmin 선례). */
async function fetchDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

function sinceIso(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().slice(0, 10);
}

// ===== 출금 큐 (08 P4) =====

export type WithdrawStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "PAID";

export interface WithdrawalRow {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  status: WithdrawStatus;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  adminMemo: string | null;
  createdAt: string;
  processedAt: string | null;
}

/** 출금 신청 목록(상태 필터). 처리(승인/반려/지급)는 withdraw-process Edge Function — 클라이언트 직접 update 금지. */
export function useWithdrawals(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.withdrawals(statusFilter),
    queryFn: async (): Promise<WithdrawalRow[]> => {
      let q = supabase
        .from("withdrawals")
        .select("id, user_id, amount, status, bank_name, bank_account, bank_holder, admin_memo, created_at, processed_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.user_id as string));
      return (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) ?? (row.user_id as string).slice(0, 8),
        amount: row.amount,
        status: row.status,
        bankName: row.bank_name,
        bankAccount: row.bank_account,
        bankHolder: row.bank_holder,
        adminMemo: row.admin_memo,
        createdAt: row.created_at,
        processedAt: row.processed_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_withdrawals")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "settlement"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// ===== 포인트 원장 감사 (08 P3·P4) =====

export interface PointLedgerAuditRow {
  id: number;
  userId: string;
  userName: string;
  entryType: "EARN" | "HOLD" | "RELEASE" | "WITHDRAW_REQUEST" | "WITHDRAW_CANCEL" | "ADJUST" | "PURCHASE";
  amount: number;
  orderId: string | null;
  withdrawalId: string | null;
  memo: string | null;
  createdAt: string;
}

/** 포인트 원장 감사 테이블(최근 limit건). append-only point_ledger 직접 조회 + 이름 join. */
export function usePointLedgerAudit(limit = 100) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.pointLedgerAudit(limit),
    queryFn: async (): Promise<PointLedgerAuditRow[]> => {
      const { data, error } = await supabase
        .from("point_ledger")
        .select("id, user_id, entry_type, amount, order_id, withdrawal_id, memo, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.user_id as string));
      return (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) ?? (row.user_id as string).slice(0, 8),
        entryType: row.entry_type,
        amount: row.amount,
        orderId: row.order_id,
        withdrawalId: row.withdrawal_id,
        memo: row.memo,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_point_ledger_audit")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_ledger" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "settlement"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// ===== 라이더별 지급 실적 (08 P5) =====

export interface RiderPayoutSummary {
  riderId: string;
  riderName: string;
  completedCount: number;
  totalKg: number;
  cashAmount: number;
  pointAmount: number;
}

/** 라이더별 지급 실적(기간 합산) — v_rider_payout_daily를 라이더 단위로 합친다. 최근 days일. */
export function useRiderPayouts(days = 30) {
  return useQuery({
    queryKey: queryKeys.riderPayouts(days),
    queryFn: async (): Promise<RiderPayoutSummary[]> => {
      const { data, error } = await supabase
        .from("v_rider_payout_daily")
        .select("rider_id, day, completed_count, total_kg, cash_amount, point_amount")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;

      const byRider = new Map<string, Omit<RiderPayoutSummary, "riderName">>();
      for (const row of data ?? []) {
        const riderId = row.rider_id as string;
        const acc = byRider.get(riderId) ?? {
          riderId,
          completedCount: 0,
          totalKg: 0,
          cashAmount: 0,
          pointAmount: 0,
        };
        acc.completedCount += Number(row.completed_count ?? 0);
        acc.totalKg += Number(row.total_kg ?? 0);
        acc.cashAmount += Number(row.cash_amount ?? 0);
        acc.pointAmount += Number(row.point_amount ?? 0);
        byRider.set(riderId, acc);
      }

      const nameMap = await fetchDisplayNameMap([...byRider.keys()]);
      return [...byRider.values()]
        .map((acc) => ({ ...acc, riderName: nameMap.get(acc.riderId) ?? acc.riderId.slice(0, 8) }))
        .sort((a, b) => b.pointAmount + b.cashAmount - (a.pointAmount + a.cashAmount));
    },
  });
}

// ===== 수거 활동 추이 (08 — 수단 분리 컬럼) =====

export interface PickupStatsDailyRow {
  day: string;
  completedCount: number;
  totalKg: number;
  /** 총 지급액(현금+포인트) — 뷰의 total_cash(의미 확장, 08 G2-③). */
  totalPaid: number;
  cashAmount: number;
  pointAmount: number;
  cashCount: number;
  pointCount: number;
}

/** 수거 활동 추이(v_pickup_stats_daily). 일별 완료건수/kg/지급액(현금·포인트 분리, completed_at 기준). */
export function usePickupStatsDaily(days = 14) {
  return useQuery({
    queryKey: queryKeys.pickupStatsDaily(days),
    queryFn: async (): Promise<PickupStatsDailyRow[]> => {
      const { data, error } = await supabase
        .from("v_pickup_stats_daily")
        .select("day, completed_count, total_kg, total_cash, cash_amount, point_amount, cash_count, point_count")
        .gte("day", sinceIso(days))
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        day: row.day,
        completedCount: Number(row.completed_count ?? 0),
        totalKg: Number(row.total_kg ?? 0),
        totalPaid: Number(row.total_cash ?? 0),
        cashAmount: Number(row.cash_amount ?? 0),
        pointAmount: Number(row.point_amount ?? 0),
        cashCount: Number(row.cash_count ?? 0),
        pointCount: Number(row.point_count ?? 0),
      }));
    },
  });
}

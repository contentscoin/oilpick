import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LedgerEntry, LedgerEntryType } from "@oilpick/ui";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface PointBalance {
  available: number;
  held: number;
}

/**
 * R7/R8 정산 "PointBalanceCard" 데이터. apps/user useWallet.ts의 usePointBalance와 동일 패턴
 * (v_point_balance 조회 + point_ledger INSERT Realtime 구독).
 */
export function usePointBalance(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.balance(userId ?? "");

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async (): Promise<PointBalance> => {
      if (!userId) return { available: 0, held: 0 };
      const { data, error } = await supabase
        .from("v_point_balance")
        .select("available, held")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return { available: data?.available ?? 0, held: data?.held ?? 0 };
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`point_ledger_self_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "point_ledger", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.balance(userId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.ledger(userId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

export function useLedger(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ledger(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<LedgerEntry[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("point_ledger")
        .select("id, entry_type, amount, memo, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        entryType: row.entry_type as LedgerEntryType,
        amount: row.amount,
        createdAt: row.created_at,
        memo: row.memo ?? undefined,
      }));
    },
  });
}

export interface EarningsSummary {
  /** RELEASE(확정 지급) 합계(P) — 00-domain.md "DELIVERED: RELEASE 행 추가"가 확정 지급 시점. */
  releasedPoint: number;
  count: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0=일요일
  const diff = date.getDate() - day;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), diff));
}

/**
 * R7/R8 "일/주 실적 집계". 태스크 지시: "point_ledger를 클라이언트에서 날짜별로 group".
 * RELEASE 항목만 집계(held→available로 확정된 실제 수령액 기준 — WITHDRAW_REQUEST/ADJUST 등은
 * 실적이 아니라 잔액 이동/조정이므로 제외). useLedger의 "최근 50건" 범위 안에서 집계하므로,
 * 하루 50건을 초과하는 극단적으로 활발한 라이더의 경우 주간 합계가 실제보다 적게 잡힐 수 있다 —
 * T10 범위(정산 개요 화면)에서는 실용적 근사로 충분하다고 판단했다. 정확한 무제한 집계가
 * 필요해지면 point_ledger를 날짜 범위로 직접 쿼리하는 훅으로 교체할 것.
 */
export function useEarningsSummary(riderId: string | undefined) {
  const { data: ledger, ...rest } = useLedger(riderId);

  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);

  const releaseEntries = (ledger ?? []).filter((e) => e.entryType === "RELEASE");

  const today: EarningsSummary = releaseEntries
    .filter((e) => new Date(e.createdAt) >= dayStart)
    .reduce((acc, e) => ({ releasedPoint: acc.releasedPoint + e.amount, count: acc.count + 1 }), {
      releasedPoint: 0,
      count: 0,
    });

  const week: EarningsSummary = releaseEntries
    .filter((e) => new Date(e.createdAt) >= weekStart)
    .reduce((acc, e) => ({ releasedPoint: acc.releasedPoint + e.amount, count: acc.count + 1 }), {
      releasedPoint: 0,
      count: 0,
    });

  return { today, week, ...rest };
}

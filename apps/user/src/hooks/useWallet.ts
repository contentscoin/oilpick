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
 * U11 지갑 "PointBalanceCard" 데이터. v_point_balance는 point_ledger 위 집계 뷰라
 * point_ledger 변경(Realtime INSERT)만 구독하면 재조회로 최신 값을 얻을 수 있다
 * (뷰 자체는 Realtime publication 대상이 아님 — 01-db-schema.sql).
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
    // userId만 deps로 사용 — queryKeys.balance(userId)는 매 렌더 새 배열 참조라 그대로 넣으면
    // 매 렌더 채널을 재구독한다(useActiveOrder.ts와 동일 패턴).
  }, [userId, queryClient]);

  return query;
}

/** U11 지갑 "LedgerList" 데이터. 최근 point_ledger 50건(최신순). */
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

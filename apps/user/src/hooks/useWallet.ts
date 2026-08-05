import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LedgerEntry, LedgerEntryType } from "@oilpick/ui";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface PointBalance {
  available: number;
  held: number;
}

/**
 * U11 지갑 잔액 히어로 데이터 — 08 G5-①로 부활(07 F8이 폐기했던 포인트 지갑 복권).
 * v_point_balance는 point_ledger 위 집계 뷰라 point_ledger 변경(Realtime INSERT)만 구독하면
 * 재조회로 최신 값을 얻을 수 있다(뷰 자체는 Realtime publication 대상이 아님 — 01-db-schema.sql).
 * 잔액 조회는 뷰만 사용, 원장 insert는 Edge Function/RPC 전용(CLAUDE.md 절대 규칙 1).
 */
export function usePointBalance(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.balance(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PointBalance> => {
      if (!userId) return { available: 0, held: 0 };
      const { data, error } = await supabase
        .from("v_point_balance")
        .select("available, held")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      // 원장 행이 없으면 뷰에 행이 없다(group by user_id) — 0으로 폴백.
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

/** 포인트 내역 1페이지 크기 — [더 보기]가 이 단위로 limit을 늘린다. */
export const LEDGER_PAGE_SIZE = 50;

/**
 * U11 지갑 "포인트 내역"(LedgerList variant="point") 데이터. point_ledger 본인 행 최신순 limit건
 * (기본 50 — WalletPage [더 보기]가 50씩 늘려 잔액(v_point_balance 전체 집계)과 대사 가능하게 한다).
 * 현역 entry_type: EARN(매각대금)/WITHDRAW_REQUEST(출금 신청)/WITHDRAW_CANCEL(출금 반려 복구)/
 * ADJUST(관리자 조정). HOLD/RELEASE/PURCHASE는 레거시 표시 전용(00-domain.md 포인트 원장 규칙).
 */
export function useLedger(userId: string | undefined, limit: number = LEDGER_PAGE_SIZE) {
  return useQuery({
    // limit을 캐시 키에 포함 — [더 보기]로 limit이 커지면 키가 분리되고, prefix
    // (queryKeys.ledger(userId)) invalidate(usePointBalance Realtime·WithdrawPage)는
    // 모든 limit 캐시에 여전히 적중한다(TanStack Query 부분 일치).
    queryKey: [...queryKeys.ledger(userId ?? ""), limit] as const,
    enabled: Boolean(userId),
    // [더 보기]로 키가 바뀌는 동안 직전 목록을 유지해 스켈레톤 재점멸을 막는다.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LedgerEntry[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("point_ledger")
        .select("id, entry_type, amount, memo, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
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

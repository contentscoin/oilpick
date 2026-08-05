import { useQuery } from "@tanstack/react-query";
import type { WithdrawProcessOutput } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/** 출금 상태 — core withdrawProcessOutputSchema의 status enum 재사용(앱별 중복 정의 금지, CLAUDE.md 7). */
export type WithdrawStatus = WithdrawProcessOutput["status"];

export interface WithdrawalItem {
  id: string;
  /** 신청 금액(P) — 신청 시점에 WITHDRAW_REQUEST(-amount)로 이미 차감된 값(08 P4). */
  amount: number;
  status: WithdrawStatus;
  createdAt: string;
  /** 승인/지급/반려 처리 시각(REQUESTED면 null). */
  processedAt: string | null;
}

const WITHDRAWALS_LIMIT = 20;

/**
 * U11 지갑 "출금 진행" 섹션 데이터 — 본인 withdrawals 최근 20건(최신순).
 * RLS p_withdraw_read(user_id = auth.uid())가 본인 행만 허용한다(01-db-schema.sql).
 * 상태 필터 없음: 진행중(REQUESTED/APPROVED)과 완결(PAID/REJECTED)을 한 목록으로 받아 화면에서
 * 톤만 나눈다. 승인(APPROVED)·지급(PAID) 전이는 원장 무기록이라(00-domain.md 출금 규칙, 08 P4)
 * point_ledger Realtime(usePointBalance)은 반려의 WITHDRAW_CANCEL만 감지한다 — 그래서
 * refetchInterval 60초 폴링 + refetchOnWindowFocus(기본값)로 상태 갱신을 따라잡는다.
 * staleTime 0: 출금 신청 직후 지갑 복귀(U12→U11)나 앱 복귀 시 마운트/포커스 재조회가 항상 돌아
 * 신규 신청·상태 변경이 30초 캐시에 가려지지 않게 한다.
 * 조회 전용 — withdrawals 쓰기는 withdraw-request/withdraw-process Edge Function만(절대 규칙 1·3).
 */
export function useWithdrawals(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.withdrawals(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async (): Promise<WithdrawalItem[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("withdrawals")
        .select("id, amount, status, created_at, processed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(WITHDRAWALS_LIMIT);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        amount: row.amount,
        status: row.status as WithdrawStatus,
        createdAt: row.created_at,
        processedAt: row.processed_at ?? null,
      }));
    },
  });
}

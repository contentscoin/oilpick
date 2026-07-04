import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface AdminWithdrawalRow {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "PAID";
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  adminMemo: string | null;
  createdAt: string;
}

async function fetchDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

/** 03-frontend.md apps/admin "/settlement": "withdrawals 큐(승인/반려/이체완료 처리)". */
export function useAdminWithdrawals(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.withdrawals(statusFilter),
    queryFn: async (): Promise<AdminWithdrawalRow[]> => {
      let q = supabase
        .from("withdrawals")
        .select("id, user_id, amount, status, bank_name, bank_account, bank_holder, admin_memo, created_at")
        .order("created_at", { ascending: false });
      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap((data ?? []).map((r) => r.user_id as string));
      return (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) ?? row.user_id.slice(0, 8),
        amount: row.amount,
        status: row.status,
        bankName: row.bank_name,
        bankAccount: row.bank_account,
        bankHolder: row.bank_holder,
        adminMemo: row.admin_memo,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_withdrawals")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "settlement", "withdrawals"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface AdminLedgerRow {
  id: number;
  userId: string;
  userName: string;
  entryType: string;
  amount: number;
  memo: string | null;
  createdAt: string;
}

/** 03-frontend.md apps/admin "/settlement": "point_ledger 감사 테이블". 최근 100건. */
export function useAdminLedgerAudit(page = 0) {
  const queryClient = useQueryClient();
  const pageSize = 100;

  const query = useQuery({
    queryKey: queryKeys.ledgerAudit(page),
    queryFn: async (): Promise<AdminLedgerRow[]> => {
      const { data, error } = await supabase
        .from("point_ledger")
        .select("id, user_id, entry_type, amount, memo, created_at")
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const nameMap = await fetchDisplayNameMap([...new Set((data ?? []).map((r) => r.user_id as string))]);
      return (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) ?? row.user_id.slice(0, 8),
        entryType: row.entry_type,
        amount: row.amount,
        memo: row.memo,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_point_ledger")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_ledger" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "settlement", "ledger"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface DailyLedgerTotal {
  day: string;
  earn: number;
  hold: number;
  release: number;
  withdraw: number;
}

/** "일별 합계" — 최근 14일 point_ledger를 entry_type별로 집계. */
export function useDailyLedgerTotals() {
  return useQuery({
    queryKey: ["admin", "settlement", "dailyTotals"],
    queryFn: async (): Promise<DailyLedgerTotal[]> => {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { data, error } = await supabase
        .from("point_ledger")
        .select("entry_type, amount, created_at")
        .gte("created_at", since.toISOString());
      if (error) throw error;

      const byDay = new Map<string, DailyLedgerTotal>();
      for (const row of data ?? []) {
        const day = new Date(row.created_at as string).toISOString().slice(0, 10);
        const entry = byDay.get(day) ?? { day, earn: 0, hold: 0, release: 0, withdraw: 0 };
        const amount = Number(row.amount);
        if (row.entry_type === "EARN") entry.earn += amount;
        else if (row.entry_type === "HOLD") entry.hold += amount;
        else if (row.entry_type === "RELEASE") entry.release += amount;
        else if (row.entry_type === "WITHDRAW_REQUEST") entry.withdraw += Math.abs(amount);
        byDay.set(day, entry);
      }
      return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    },
  });
}

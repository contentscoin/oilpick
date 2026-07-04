import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface BankAccount {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
}

/**
 * R8 출금용 "계좌 등록/표시". rider_profiles.bank_*(01-db-schema.sql) 조회/수정.
 * apps/user/src/hooks/useBankAccount.ts와 동일 패턴(테이블만 rider_profiles로 다름) — RLS
 * p_rider_self("본인 R/W")로 직접 select/update.
 */
export function useBankAccount(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bankAccount(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<BankAccount | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("rider_profiles")
        .select("bank_name, bank_account, bank_holder")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.bank_name || !data.bank_account || !data.bank_holder) return null;
      return { bankName: data.bank_name, bankAccount: data.bank_account, bankHolder: data.bank_holder };
    },
  });
}

export function useSaveBankAccount(userId: string | undefined) {
  const queryClient = useQueryClient();
  return async (account: BankAccount) => {
    if (!userId) throw new Error("로그인이 필요해요.");
    const { error } = await supabase
      .from("rider_profiles")
      .update({
        bank_name: account.bankName,
        bank_account: account.bankAccount,
        bank_holder: account.bankHolder,
      })
      .eq("id", userId);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: queryKeys.bankAccount(userId) });
  };
}

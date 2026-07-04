import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface BankAccount {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
}

/**
 * U12 "계좌 등록/표시". supplier_profiles.bank_*(01-db-schema.sql) 조회/수정.
 * withdraw-request Edge Function이 이 컬럼을 그대로 읽어 계좌 정보를 채우므로(02-api.md
 * withdraw-request), 여기서는 본인 행 RLS(p_sup_self: "본인 R/W")로 직접 select/update한다 —
 * 포인트 원장/주문 상태와 무관한 프로필 필드 수정이라 CLAUDE.md 절대 규칙 1/2에 해당하지 않는다.
 */
export function useBankAccount(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bankAccount(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<BankAccount | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("supplier_profiles")
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
      .from("supplier_profiles")
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

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface SupplierProfile {
  id: string;
  displayName: string;
  storeName: string;
  address: string;
}

/** profiles + supplier_profiles 조회. AuthGuard/홈 화면에서 로그인한 supplier 정보 표시용. */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<SupplierProfile | null> => {
      if (!userId) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return null;

      const { data: supplier, error: supplierError } = await supabase
        .from("supplier_profiles")
        .select("store_name, address")
        .eq("id", userId)
        .maybeSingle();
      if (supplierError) throw supplierError;

      return {
        id: profile.id,
        displayName: profile.display_name,
        storeName: supplier?.store_name ?? "",
        address: supplier?.address ?? "",
      };
    },
  });
}

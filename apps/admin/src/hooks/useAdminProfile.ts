import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

/**
 * 03-frontend.md apps/admin: "admin 로그인: 이메일/비밀번호. role≠admin이면 접근 차단."
 * profiles.role을 조회해 admin 여부를 판단한다 — role은 클라이언트가 자칭할 수 없고
 * (CLAUDE.md 절대 규칙 3) profiles 테이블(서버측 값)을 그대로 읽는다.
 */
export function useAdminProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["adminProfile", userId ?? ""],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

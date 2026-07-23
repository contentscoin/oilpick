import { useSession } from "./useSession";
import { useAdminProfile } from "./useAdminProfile";

/** 현재 로그인 사용자의 role('admin' | 'dealer' | ...). 셸/라우팅 분기용(13 I3). */
export function useCurrentRole(): { role: string | undefined; loading: boolean } {
  const { session, loading } = useSession();
  const { data: profile, isLoading } = useAdminProfile(session?.user.id);
  return { role: profile?.role, loading: loading || isLoading };
}

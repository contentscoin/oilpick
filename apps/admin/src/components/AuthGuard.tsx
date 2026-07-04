import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useAdminProfile } from "../hooks/useAdminProfile";
import { supabase } from "../lib/supabaseClient";

/**
 * 03-frontend.md apps/admin: "admin 로그인: 이메일/비밀번호. role≠admin이면 접근 차단."
 * 세션이 없으면 /login으로, 세션은 있지만 profiles.role이 admin이 아니면 접근을 막고
 * 로그아웃 처리한다(다른 role 계정으로 admin 웹에 들어오는 것을 방지).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useAdminProfile(userId);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (profileLoading) return null;
  if (!profile || profile.role !== "admin") {
    return <AccessDenied />;
  }
  return <>{children}</>;
}

function AccessDenied() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
      <p className="text-lg font-semibold text-zinc-900">관리자 계정만 접근할 수 있어요.</p>
      <button
        type="button"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.href = "/login";
        }}
      >
        로그아웃
      </button>
    </main>
  );
}

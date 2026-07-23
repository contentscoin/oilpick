import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useAdminProfile } from "../hooks/useAdminProfile";
import { supabase } from "../lib/supabaseClient";

/**
 * 03-frontend.md apps/admin + 13 I3: admin 웹은 role='admin'(본사) 또는 role='dealer'(좌상,
 * 서브어드민)만 접근 가능. 그 외(supplier/rider)는 차단·로그아웃. 세션 없으면 /login.
 * 메뉴·라우트는 role로 분기(AdminShell·App.tsx) — 여기선 웹 진입 자격만 판단한다.
 */
const ADMIN_WEB_ROLES = ["admin", "dealer"];

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useAdminProfile(userId);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (profileLoading) return null;
  if (!profile || !ADMIN_WEB_ROLES.includes(profile.role as string)) {
    return <AccessDenied />;
  }
  return <>{children}</>;
}

function AccessDenied() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-app p-6 text-center">
      <p className="text-lg font-semibold text-gray-900">관리자 계정만 접근할 수 있어요.</p>
      <button
        type="button"
        className="rounded-button bg-primary px-4 py-2 text-sm font-medium text-white shadow-card"
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

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";

/**
 * 인증 안 된 사용자는 /auth로 리다이렉트(apps/user AuthGuard와 동일 패턴).
 * 세션 로딩 중에는 리다이렉트하지 않고 대기해 로그인된 사용자가 잠깐 /auth로
 * 튕기는 깜빡임을 방지한다.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();

  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

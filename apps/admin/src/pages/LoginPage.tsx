import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * 03-frontend.md apps/admin: "admin 로그인: 이메일/비밀번호 (admin 계정은 시드로 생성).
 * role≠admin이면 접근 차단." 시드 계정: supabase/seed.sql (admin@oilpick.local).
 * role 검증 자체는 AuthGuard가 profiles.role로 수행 — 이 화면은 Auth 로그인만 담당한다.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("이메일 또는 비밀번호가 올바르지 않아요.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-app p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-hero bg-white p-8 shadow-raised"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-card bg-primary-light text-lg font-bold text-primary">
            O
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight text-primary">OilPick 관리자</h1>
            <p className="text-sm text-gray-500">이메일과 비밀번호로 로그인하세요.</p>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-button border border-gray-200 px-3 py-3 text-base outline-none focus:border-primary"
            placeholder="admin@oilpick.local"
            data-testid="login-email"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-button border border-gray-200 px-3 py-3 text-base outline-none focus:border-primary"
            data-testid="login-password"
          />
        </label>

        {error && (
          <p className="mb-4 text-sm font-medium text-status-danger" data-testid="login-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-button bg-primary text-base font-semibold text-white shadow-card transition-transform active:scale-[.99] disabled:opacity-60"
          data-testid="login-submit"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}

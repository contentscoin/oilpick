import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * admin 로그인 — 이메일이 아니라 **아이디/비밀번호**로 로그인한다(요청사항). Supabase Auth(GoTrue)는
 * 내부적으로 이메일 기반이라, 입력한 아이디를 고정 도메인과 합쳐 이메일로 매핑해 인증한다
 * (예: "admin" → "admin@oilpick.local"). 사용자는 이메일을 알 필요가 없다.
 * role 검증은 AuthGuard가 profiles.role로 수행 — 이 화면은 Auth 로그인만 담당한다.
 */
const ADMIN_LOGIN_DOMAIN = "oilpick.local";
const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${ADMIN_LOGIN_DOMAIN}`;

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError("아이디 또는 비밀번호가 올바르지 않아요.");
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
            <h1 className="text-xl font-bold leading-tight text-primary">오반장 관리자</h1>
            <p className="text-sm text-gray-500">아이디와 비밀번호로 로그인하세요.</p>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">아이디</span>
          <input
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-button border border-gray-200 px-3 py-3 text-base outline-none focus:border-primary"
            placeholder="admin"
            data-testid="login-username"
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

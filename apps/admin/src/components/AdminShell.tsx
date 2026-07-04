import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * 03-frontend.md apps/admin: "사이드바 내비, shadcn/ui + TanStack Table".
 * shadcn/ui 컴포넌트 CLI 없이(이 환경엔 네트워크로 shadcn registry를 당겨오는 절차가
 * 무겁고 T11 범위상 불필요) Tailwind 유틸리티로 직접 shadcn 톤(라운드, 그림자, zinc 팔레트)을
 * 맞춘 최소 사이드바 레이아웃. packages/ui는 admin에서 재사용하지 않는다는 03 스펙 원칙을
 * 지키되, MapView만 태스크 지시사항대로 예외적으로 재사용한다(대시보드 지도).
 */
const NAV_ITEMS = [
  { to: "/", label: "대시보드", end: true },
  { to: "/price", label: "시세 관리" },
  { to: "/orders", label: "주문 관리" },
  { to: "/users", label: "회원 관리" },
  { to: "/settlement", label: "정산" },
  { to: "/depots", label: "집하장" },
  { to: "/notify", label: "공지" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="px-5 py-6">
          <p className="text-lg font-bold text-primary">OilPick</p>
          <p className="text-xs text-zinc-400">관리자</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary-light text-primary" : "text-zinc-600 hover:bg-zinc-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-6">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            data-testid="logout-button"
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}

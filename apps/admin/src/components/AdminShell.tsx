import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { PayouSymbol } from "@oilpick/ui";
import { supabase } from "../lib/supabaseClient";
import { useCurrentRole } from "../hooks/useCurrentRole";
import { NotificationsBell } from "./NotificationsBell";

/**
 * 03-frontend.md apps/admin: "사이드바 내비, shadcn/ui + TanStack Table".
 * shadcn/ui 컴포넌트 CLI 없이(이 환경엔 네트워크로 shadcn registry를 당겨오는 절차가
 * 무겁고 T11 범위상 불필요) Tailwind 유틸리티로 직접 shadcn 톤(라운드, 그림자, zinc 팔레트)을
 * 맞춘 최소 사이드바 레이아웃. packages/ui는 admin에서 재사용하지 않는다는 03 스펙 원칙을
 * 지키되, MapView만 태스크 지시사항대로 예외적으로 재사용한다(대시보드 지도).
 */
// 13 I3: role별 메뉴. admin=본사 전체 + 좌상 관리. dealer=좌상 서브어드민 메뉴만.
const ADMIN_NAV = [
  { to: "/", label: "대시보드", end: true },
  { to: "/price", label: "시세 관리" },
  { to: "/orders", label: "주문 관리" },
  { to: "/users", label: "회원 관리" },
  { to: "/dealers", label: "좌상 관리" }, // 13 I3 신설
  { to: "/settlement", label: "정산" }, // 08 G7-① 재편(출금 큐·포인트 정산)
  { to: "/cs", label: "CS" }, // 07 F12 신설
  { to: "/referrals", label: "레퍼럴" }, // 09 H4 신설(추천 실적분석)
  // [07 F13] 집하장(/depots) 내비 제거 — 집하장/QR 배송 소멸(07 §0). 라우트도 App.tsx에서 제거.
  { to: "/notify", label: "공지" },
];
const DEALER_NAV = [
  { to: "/", label: "관할 대시보드", end: true },
  { to: "/performance", label: "소속 실적" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { role } = useCurrentRole();
  const navItems = role === "dealer" ? DEALER_NAV : ADMIN_NAV;
  const roleLabel = role === "dealer" ? "좌상" : "관리자";

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-surface-app">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-white shadow-card">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <PayouSymbol size={36} />
          <div>
            <p className="text-lg font-bold leading-tight text-primary">폐유</p>
            <p className="text-xs text-gray-500" data-testid="admin-role-label">{roleLabel}</p>
          </div>
        </div>
        {/* admin 알림 벨(이의신청·무수락 취소 통지 소비 지면 — 00-domain 알림 매트릭스 "admin 웹 알림"). */}
        <NotificationsBell />
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-card px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary-light text-primary" : "text-gray-600 hover:bg-gray-100"
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
            className="w-full rounded-card px-3 py-2.5 text-left text-sm font-medium text-gray-500 hover:bg-gray-100"
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

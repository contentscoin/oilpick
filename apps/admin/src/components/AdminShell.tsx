import { useState, type ReactNode } from "react";
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
 * [03 레이아웃 강건성] md 미만(좌상이 폰으로 접속하는 실사용 — 13 I 조직 계층)에선 고정
 * 사이드바 대신 상단바(브랜드+햄버거) + 오버레이 드로어로 같은 nav 목록을 제공한다.
 */
// 13 I3: role별 메뉴. admin=본사 전체 + 좌상 관리. dealer=좌상 서브어드민 메뉴만.
// [19 T3] 메뉴를 업무 축으로 그룹핑한다 — 항목이 10개를 넘기며 평면 목록에서 원하는 화면을
// 찾는 비용이 커졌다. 라우트·role 게이트는 불변(표시 구조만 변경, 19 §1 T3).
interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    title: "운영",
    items: [
      { to: "/", label: "대시보드", end: true },
      { to: "/orders", label: "주문 관리" },
      { to: "/price", label: "시세 관리" },
    ],
  },
  {
    title: "조직·회원",
    items: [
      { to: "/users", label: "회원 관리" },
      { to: "/dealers", label: "좌상 관리" }, // 13 I3 신설
    ],
  },
  {
    // 그룹명이 항목명("정산")과 같으면 사이드바에서 제목과 링크가 구분되지 않는다 — 축을 넓혀 쓴다.
    title: "정산·청구",
    items: [
      { to: "/settlement", label: "정산" }, // 08 G7-① 재편(출금 큐·포인트 정산)
      { to: "/dealer-settlement", label: "좌상 정산" }, // 14 J3 신설(보증금 크레딧·청구)
    ],
  },
  {
    title: "추적·분석",
    items: [
      { to: "/traceability", label: "유통이력" }, // [19 T7] 신설 — 바코드별 회수 이력
      { to: "/referrals", label: "레퍼럴" }, // 09 H4 신설(추천 실적분석)
    ],
  },
  {
    title: "지원",
    items: [
      { to: "/cs", label: "CS" }, // 07 F12 신설
      // [07 F13] 집하장(/depots) 내비 제거 — 집하장/QR 배송 소멸(07 §0). 라우트도 App.tsx에서 제거.
      { to: "/notify", label: "공지" },
    ],
  },
];
const DEALER_NAV: NavGroup[] = [
  {
    title: "관할",
    items: [
      { to: "/", label: "관할 대시보드", end: true },
      { to: "/performance", label: "소속 실적" },
    ],
  },
  {
    title: "정산",
    items: [
      { to: "/statement", label: "정산 명세" }, // 14 J3 신설(본인 사용액·청구 이력)
    ],
  },
];

/** 사이드바(데스크톱)·드로어(모바일)가 공유하는 nav 목록. 드로어에선 onNavigate로 닫는다. */
function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-4 px-3">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.title}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `rounded-card px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary-light text-primary" : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { role } = useCurrentRole();
  const navGroups = role === "dealer" ? DEALER_NAV : ADMIN_NAV;
  const roleLabel = role === "dealer" ? "좌상" : "관리자";
  // [03 레이아웃 강건성] md 미만 오버레이 드로어 — 닫힌 상태에선 렌더하지 않는다(항목 중복 방지).
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-surface-app">
      {/* 데스크톱 사이드바 — md 미만에선 상단바+드로어가 대체한다. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-100 bg-white shadow-card md:flex">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <PayouSymbol size={36} />
          <div>
            <p className="text-lg font-bold leading-tight text-primary">폐유</p>
            <p className="text-xs text-gray-500" data-testid="admin-role-label">{roleLabel}</p>
          </div>
        </div>
        {/* admin 알림 벨(이의신청·무수락 취소 통지 소비 지면 — 00-domain 알림 매트릭스 "admin 웹 알림"). */}
        <NotificationsBell />
        <NavList groups={navGroups} />
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* md 미만 상단바: 브랜드 + 햄버거(드로어 열기). */}
        <header className="flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3 shadow-card md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <PayouSymbol size={28} />
            <p className="truncate text-base font-bold leading-tight text-primary">
              폐유 <span className="text-xs font-medium text-gray-500">{roleLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
            className="shrink-0 rounded-card px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            data-testid="admin-nav-open"
          >
            ☰ 메뉴
          </button>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>

      {/* md 미만 오버레이 드로어 — 배경 딤 클릭·닫기 버튼·nav 이동으로 닫힌다. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" data-testid="admin-nav-drawer">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-64 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto bg-white shadow-raised">
            <div className="flex items-center justify-between gap-2 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <PayouSymbol size={28} />
                <p className="truncate text-base font-bold leading-tight text-primary">
                  폐유 <span className="text-xs font-medium text-gray-500">{roleLabel}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="메뉴 닫기"
                className="shrink-0 rounded-card px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100"
                data-testid="admin-nav-close"
              >
                닫기
              </button>
            </div>
            <NotificationsBell />
            <NavList groups={navGroups} onNavigate={() => setDrawerOpen(false)} />
            <div className="px-3 pb-6">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-card px-3 py-2.5 text-left text-sm font-medium text-gray-500 hover:bg-gray-100"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "@oilpick/ui";

/**
 * 03-frontend.md apps/rider "하단 탭: 콜/운행/실적/마이". TabBar(packages/ui) 재사용.
 * 07 F6-⑤: "정산"(포인트 출금) → "실적"(수거 실적)으로 개명. 탭 이동은 이 컴포넌트가
 * useNavigate로 처리(TabBar 자체는 라우팅에 의존하지 않음).
 */
const TABS = [
  { key: "calls", label: "콜", path: "/" },
  { key: "active", label: "운행", path: "/active" },
  { key: "earnings", label: "실적", path: "/earnings" },
  { key: "my", label: "마이", path: "/my" },
];

export function RiderShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = TABS.find((t) => t.path === location.pathname)?.key ?? "calls";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1 }}>{children}</div>
      <TabBar
        items={TABS.map(({ key, label }) => ({ key, label }))}
        activeKey={activeTab}
        onSelect={(key) => {
          const tab = TABS.find((t) => t.key === key);
          if (tab) navigate(tab.path);
        }}
      />
    </div>
  );
}

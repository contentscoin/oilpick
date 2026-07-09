import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "@oilpick/ui";

/**
 * 03-frontend.md apps/user "하단 탭: 홈/수거/수령액/마이". TabBar(packages/ui) 재사용.
 * ("포인트" 탭은 07 F8/D1로 "수령액"(현장 현금 수령 이력)으로 개명 — 포인트 적립·출금 폐기.)
 * apps/rider/src/components/RiderShell.tsx와 동일 패턴 — 탭 이동은 이 컴포넌트가 useNavigate로
 * 처리한다(TabBar 자체는 라우팅에 의존하지 않음).
 * "수거"는 진행중 주문이 있으면 상세로, 없으면 요청 화면(U5)으로 보낸다(U3 홈의 "진행중 주문"
 * 카드와 동일한 내비게이션 의도 — 이 셸은 어떤 화면에서도 재사용되므로 활성 주문 여부를 알 수
 * 없어 항상 /request로 보내고, 진행중 주문이 있을 때의 우선 노출은 홈 화면 상단 카드가 담당한다).
 */
const TABS = [
  { key: "home", label: "홈", path: "/" },
  { key: "request", label: "수거", path: "/request" },
  { key: "wallet", label: "수령액", path: "/wallet" },
  { key: "my", label: "마이", path: "/my" },
];

export function UserShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = TABS.find((t) => t.path === location.pathname)?.key ?? "home";

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

import type { ReactNode } from "react";
import { colors } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — TabBar(하단 탭).
 * apps/user "홈/수거/포인트/마이", apps/rider "콜/운행/정산/마이"에서 공용으로 쓴다.
 * 라우팅 라이브러리(react-router)에 의존하지 않도록 각 탭은 순수 콜백(onSelect)만 받는다 —
 * 실제 라우트 이동은 호출 측(앱)에서 useNavigate 등으로 처리.
 */
export interface TabBarItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}

export function TabBar({ items, activeKey, onSelect, className }: TabBarProps) {
  return (
    <nav
      className={className}
      data-testid="tab-bar"
      style={{
        display: "flex",
        borderTop: "1px solid #e4e4e7",
        backgroundColor: "#fff",
        height: 64,
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            data-testid={`tab-bar-item-${item.key}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              minHeight: 48,
              border: "none",
              background: "none",
              color: active ? colors.primary.DEFAULT : colors.status.wait,
              fontWeight: active ? 700 : 500,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

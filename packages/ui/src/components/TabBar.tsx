import type { ReactNode } from "react";
import { colors, gray, surface } from "../tokens";

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
        borderTop: `1px solid ${surface.border}`,
        backgroundColor: surface.card,
        // 안전영역(safe-area-inset-bottom) 패딩. 홈 인디케이터/노치 대응.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: 60,
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
              // 균등 분배 + min-width 0으로 라벨 잘림 방지.
              flex: "1 1 0",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              minHeight: 56,
              padding: "8px 2px",
              border: "none",
              background: "none",
              color: active ? colors.primary.DEFAULT : gray[400],
              fontWeight: active ? 700 : 500,
              fontSize: 12,
              lineHeight: 1.2,
              cursor: "pointer",
            }}
          >
            {item.icon && (
              <span aria-hidden style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 24 }}>
                {item.icon}
              </span>
            )}
            <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

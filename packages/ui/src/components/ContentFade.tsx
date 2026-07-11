import type { ReactNode } from "react";

/**
 * 05-design-upgrade.md 2026-07-10 폴리시 패스 후속 — 라우트/탭 전환 페이드.
 * fadeKey가 바뀔 때마다 래퍼가 리마운트되며 styles.css `.oilpick-fade-in-up`(250ms,
 * prefers-reduced-motion 시 animation:none)을 다시 태운다. packages/ui는 라우팅에 의존하지
 * 않으므로(TabBar와 동일 원칙) 호출부(앱)가 location.pathname 등을 fadeKey로 넘긴다.
 * 셸(탭바) 밖 콘텐츠에만 감쌀 것 — 탭바까지 감싸면 탭 전환마다 탭바가 재등장한다.
 */
export interface ContentFadeProps {
  fadeKey: string;
  children: ReactNode;
}

export function ContentFade({ fadeKey, children }: ContentFadeProps) {
  return (
    <div key={fadeKey} className="oilpick-fade-in-up" data-testid="content-fade">
      {children}
    </div>
  );
}

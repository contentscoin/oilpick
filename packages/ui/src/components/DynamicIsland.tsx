import { type ReactNode } from "react";
import { radius, surfaceDark } from "../tokens";
import { LiveDot } from "./LiveDot";

/**
 * 15-motion-design.md — 지금 진행 중인 **단 하나의 상태**를 한 줄로 축약하는 pill.
 * 사용자 앱: 평균 배정 시간·라이더 ETA. 라이더 앱: 콜 수신 중·도착까지 남은 시간.
 *
 * 화면에 둘 이상 띄우지 않는다 — "지금 무엇이 진행 중인가"의 답이 둘이면 축약이 아니다.
 * 상태는 텍스트로도 완전히 읽혀야 한다(도트 색만으로 알리지 않는다 — 15 원칙 3).
 */
export interface DynamicIslandProps {
  /** pill에 표시할 상태 문장. 예: "14:35 도착 · 1.8km" */
  children: ReactNode;
  /** 라이브 도트 색. 기본 라임. 다크 pill 위에만 쓰므로 밝은 색을 넣는다. */
  dotColor?: string;
  /** false면 도트를 숨긴다(실시간 갱신이 아닌 정적 안내). */
  live?: boolean;
  /** 우측에 붙는 보조 노드(아이콘 버튼 등). */
  trailing?: ReactNode;
  className?: string;
}

export function DynamicIsland({
  children,
  dotColor,
  live = true,
  trailing,
  className,
}: DynamicIslandProps) {
  return (
    <div
      data-testid="dynamic-island"
      // 상태 변화가 스크린리더에도 전달되도록 — 단, 값이 자주 바뀌므로 polite.
      role="status"
      aria-live="polite"
      className={["oilpick-island", className].filter(Boolean).join(" ") || undefined}
      style={{
        minHeight: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        borderRadius: radius.pill,
        padding: "0 14px",
        backgroundColor: surfaceDark.beui,
        color: surfaceDark.textOnDark,
        boxShadow: "0 14px 34px rgba(16,19,23,0.28)",
        fontSize: 13,
        fontWeight: 800,
        maxWidth: "100%",
        wordBreak: "keep-all",
      }}
    >
      {live && <LiveDot color={dotColor} />}
      <span style={{ minWidth: 0 }}>{children}</span>
      {trailing}
    </div>
  );
}

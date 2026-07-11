import type { ReactNode } from "react";
import { gray, typeScale } from "../tokens";

/**
 * 05-design-upgrade.md 후속 "헤더 관용구 3종 통일" — 서브페이지 공용 헤더.
 * 통일 관용구: 좌측 뒤로가기(44×44 터치 타깃, marginLeft -12 시각 보정, "<" 글리프)
 * + 중앙 타이틀(16/700/gray-900) + 우측 슬롯(기본: width 32 스페이서 — 뒤로가기와 좌우 균형).
 *
 * TabBar와 같은 원칙으로 라우팅 라이브러리(react-router)에 의존하지 않는다 — 뒤로가기는
 * 순수 콜백(onBack)만 받고 실제 라우트 이동은 호출 측(앱)에서 useNavigate 등으로 처리.
 */
export interface PageHeaderProps {
  title: string;
  /** 뒤로가기 콜백. 없으면 버튼 대신 width 32 스페이서를 렌더해 좌우 대칭을 유지한다. */
  onBack?: () => void;
  /** 뒤로가기 버튼 data-testid(페이지별 기존 testid 보존용). */
  backTestId?: string;
  /** 뒤로가기 버튼 aria-label. 기본 "뒤로가기". */
  backAriaLabel?: string;
  /** 우측 슬롯(예: 알림 벨). 없으면 뒤로가기와 균형을 맞추는 스페이서를 렌더한다. */
  right?: ReactNode;
  className?: string;
}

/** 뒤로가기(44 - 시각 보정 12) 및 우측 기본 스페이서의 실효 폭. 좌우 대칭의 기준값. */
const SPACER_WIDTH = 32;

function Spacer() {
  return <span aria-hidden style={{ width: SPACER_WIDTH, flexShrink: 0 }} />;
}

export function PageHeader({
  title,
  onBack,
  backTestId,
  backAriaLabel = "뒤로가기",
  right,
  className,
}: PageHeaderProps) {
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {onBack ? (
        <button
          type="button"
          data-testid={backTestId}
          aria-label={backAriaLabel}
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            // 글리프의 시각적 좌측 라인을 콘텐츠 패딩에 맞추는 보정(터치 타깃은 44 유지).
            marginLeft: -12,
            flexShrink: 0,
            background: "none",
            border: "none",
            fontSize: typeScale.title,
            cursor: "pointer",
            padding: 0,
            color: gray[900],
            lineHeight: 1,
          }}
        >
          &lt;
        </button>
      ) : (
        <Spacer />
      )}
      <h1
        style={{
          fontSize: typeScale.body,
          margin: 0,
          flex: 1,
          minWidth: 0,
          fontWeight: 700,
          textAlign: "center",
          color: gray[900],
        }}
      >
        {title}
      </h1>
      {right ?? <Spacer />}
    </div>
  );
}

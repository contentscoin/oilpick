import { type ReactNode } from "react";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 05-design-upgrade.md "## U7 주문상세 — 목업 확정" 5번 — 정보 스탯 카드(신규).
 * 3열 스탯(예상 수량 / 오늘 매입가 / 예상 포인트) + 하단 footnote(info 아이콘 + 텍스트).
 * accent=true인 값은 앰버 강조. 흰 카드 + shadow-card, 열 사이 얇은 구분선.
 */
export interface InfoStat {
  label: string;
  value: string;
  /** true면 값을 앰버(accent)로 강조. */
  accent?: boolean;
}

export interface InfoStatCardProps {
  stats: InfoStat[];
  /** 하단 안내 문구(예: "현장 계량 기준으로 확정됩니다"). */
  footnote?: ReactNode;
  className?: string;
}

function InfoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden fill="none">
      <circle cx={8} cy={8} r={7} stroke={colors.status.wait} strokeWidth={1.4} />
      <path d="M8 7.2v4" stroke={colors.status.wait} strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={8} cy={4.8} r={0.9} fill={colors.status.wait} />
    </svg>
  );
}

export function InfoStatCard({ stats, footnote, className }: InfoStatCardProps) {
  return (
    <div
      className={className}
      data-testid="info-stat-card"
      style={{
        borderRadius: radius.card,
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
        boxShadow: elevation.card,
        overflow: "hidden",
      }}
    >
      {/* [03 레이아웃 강건성] 글자 확대 시 셀이 행 접힘(flexWrap)으로 흐른다 — 금액이 잘려
          틀리게 읽히던 결함. 구분선은 모든 셀 왼쪽에 긋고 행을 -1px 당겨, 각 줄 첫 셀의
          구분선을 카드 overflow:hidden이 클립하게 한다(폭 확장 아님 — 1x 외관 동일). */}
      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 12, padding: "16px 0", marginLeft: -1 }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            data-testid="info-stat-cell"
            style={{
              flex: "1 1 96px",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "0 8px",
              textAlign: "center",
              // 열 사이 얇은 구분선(줄 첫 셀 몫은 카드 밖 -1px에서 클립됨).
              borderLeft: `1px solid ${surface.border}`,
            }}
          >
            <span style={{ fontSize: 13, color: colors.status.wait }}>{stat.label}</span>
            <span
              className="oilpick-tabular-nums"
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                color: stat.accent ? colors.accent.deep : gray[900],
                wordBreak: "keep-all",
                // 금액은 잘리면 오독 — 셀 폭을 넘치면 줄바꿈으로 흐른다(ellipsis 금지).
                overflowWrap: "anywhere",
              }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
      {footnote && (
        <div
          data-testid="info-stat-footnote"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 16px",
            borderTop: `1px solid ${surface.border}`,
            backgroundColor: gray[50],
            fontSize: 12,
            color: colors.status.wait,
          }}
        >
          <InfoIcon />
          <span>{footnote}</span>
        </div>
      )}
    </div>
  );
}

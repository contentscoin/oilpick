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
      <div style={{ display: "flex", padding: "16px 0" }}>
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            data-testid="info-stat-cell"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "0 8px",
              textAlign: "center",
              // 열 사이 얇은 구분선(첫 열 제외).
              borderLeft: i === 0 ? "none" : `1px solid ${surface.border}`,
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

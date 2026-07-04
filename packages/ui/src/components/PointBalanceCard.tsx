import type { ButtonHTMLAttributes, ReactNode } from "react";
import { formatPoint } from "@oilpick/core";
import { colors, elevation, gradient, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PointBalanceCard.
 * 05-design-upgrade.md "PointBalanceCard(포인트 히어로)": 앰버 gradient 히어로 카드로 격상.
 * 잔액 흰색 36px bold, "보유 포인트" 라벨 흰색 80%, held는 하단 반투명 pill,
 * 카드 아래 [출금 신청] CTA 슬롯(앰버 위에서는 흰 버튼).
 *
 * public props(available/held/className)는 그대로 유지하고, 다음을 선택적으로 추가:
 * - heldLabel: rider 정산은 "배송완료 시 확정"으로 문구 대체(기본은 supplier "지급 확정 대기").
 * - action: 카드 하단 CTA 슬롯(예: [출금 신청]). 지정 시에만 렌더.
 */
export interface PointBalanceCardProps {
  /** 즉시 출금 가능한 잔액(P). v_point_balance.available. */
  available: number;
  /** 지급 확정 대기 중인 보류 포인트(P). v_point_balance.held. */
  held?: number;
  /** held pill의 접두 문구. 기본 "지급 확정 대기"(supplier). rider는 "배송완료 시 확정" 등. */
  heldLabel?: string;
  /** 카드 하단 CTA 슬롯(예: 출금 신청 버튼). */
  action?: ReactNode;
  className?: string;
}

export function PointBalanceCard({
  available,
  held = 0,
  heldLabel = "지급 확정 대기",
  action,
  className,
}: PointBalanceCardProps) {
  return (
    <div
      className={className}
      data-testid="point-balance-card"
      style={{
        borderRadius: radius.hero,
        padding: 20,
        background: gradient.point,
        boxShadow: elevation.raised,
        color: "#fff",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
        보유 포인트
      </p>
      <p
        className="oilpick-tabular-nums"
        style={{
          margin: "6px 0 0",
          fontSize: 36,
          lineHeight: 1.1,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#fff",
        }}
      >
        {formatPoint(available)}
      </p>
      {held > 0 && (
        <span
          className="oilpick-tabular-nums"
          data-testid="point-balance-held"
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginTop: 12,
            padding: "4px 12px",
            borderRadius: radius.pill,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            backgroundColor: "rgba(255,255,255,0.22)",
          }}
        >
          {heldLabel} {formatPoint(held)}
        </span>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/**
 * 앰버 히어로 위에 얹는 출금 CTA 버튼(흰 배경 + green 텍스트).
 * BigButton은 항상 green 배경이라 히어로 위 대비가 약해, 히어로 전용 흰 버튼을 별도 제공한다.
 * PointBalanceCard의 action 슬롯에 넣어 쓴다.
 */
export interface PointHeroActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function PointHeroAction({
  children,
  disabled,
  className,
  style,
  ...rest
}: PointHeroActionProps) {
  return (
    <button
      type="button"
      className={className}
      data-testid="point-hero-action"
      disabled={disabled}
      {...rest}
      style={{
        height: 48,
        width: "100%",
        borderRadius: radius.button,
        border: "none",
        backgroundColor: "#fff",
        color: colors.primary.DEFAULT,
        fontSize: 16,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: elevation.card,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { formatPoint } from "@oilpick/core";
import { colors, elevation, gradient, radius, surfaceDark } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PointBalanceCard.
 * 05-design-upgrade.md "PointBalanceCard(포인트 히어로)": 앰버 gradient 히어로 카드로 격상.
 * 잔액 흰색 36px bold, "보유 포인트" 라벨 흰색 80%, held는 하단 반투명 pill,
 * 카드 아래 [출금 신청] CTA 슬롯(앰버 위에서는 흰 버튼).
 *
 * public props(available/held/className)는 그대로 유지하고, 다음을 선택적으로 추가:
 * - heldLabel: rider 정산은 "배송완료 시 확정"으로 문구 대체(기본은 supplier "지급 확정 대기").
 * - action: 카드 하단 CTA 슬롯(예: [출금 신청]). 지정 시에만 렌더.
 * - [07 F5] label/formatValue: 쿠폰 잔액 히어로로 일반화 재사용(03-frontend.md "PointBalanceCard는
 *   쿠폰 잔액으로 일반화 재사용"). label="보유 수거쿠폰", formatValue={(n)=>`${n}장`}로 쓰면 된다.
 *   기본값(보유 포인트/formatPoint)이라 기존 사용처는 무영향.
 * - [07 F5] onClick: 카드 전체 탭(예: 쿠폰 잔액 카드 → 쿠폰 내역). 지정 시 role=button + 키보드
 *   지원. 내부 action 버튼은 중첩 버튼(invalid DOM)을 피하려 div+role로 두고, action의 onClick에서
 *   stopPropagation을 호출해 카드 탭과 분리한다(호출부 책임).
 */
export interface PointBalanceCardProps {
  /** 즉시 사용 가능한 잔액(포인트=P, 쿠폰=장). v_point_balance.available / v_coupon_balance.balance. */
  available: number;
  /** 지급 확정 대기 중인 보류 포인트(P). v_point_balance.held. 쿠폰은 미지정(0). */
  held?: number;
  /** held pill의 접두 문구. 기본 "지급 확정 대기"(supplier). rider는 "배송완료 시 확정" 등. */
  heldLabel?: string;
  /** 상단 라벨. 기본 "보유 포인트". 07 F5 쿠폰은 "보유 수거쿠폰". */
  label?: string;
  /** 잔액 포맷터. 기본 formatPoint(P). 07 F5 쿠폰은 `(n)=>`${n}장``. */
  formatValue?: (value: number) => string;
  /** 카드 하단 CTA 슬롯(예: 출금 신청/충전하기 버튼). */
  action?: ReactNode;
  /** 카드 전체 탭 핸들러(예: 쿠폰 내역으로 이동). 지정 시 카드가 버튼 역할을 한다. */
  onClick?: () => void;
  /**
   * [15] 카드 톤. 기본 "point"(앰버 gradient, 05 이래의 포인트 히어로).
   * "dark"는 beUI 목업의 월렛 카드 — 뉴트럴 다크 패널 + 라임 글로우. 지갑처럼 "돈이 쌓이는 곳"을
   * 화면에서 가장 무겁게 보이게 할 때 쓴다. 라임은 다크 배경 전용이라 이 톤에서만 등장한다.
   */
  tone?: "point" | "dark";
  className?: string;
}

export function PointBalanceCard({
  available,
  held = 0,
  heldLabel = "지급 확정 대기",
  label = "보유 포인트",
  formatValue = formatPoint,
  action,
  onClick,
  tone = "point",
  className,
}: PointBalanceCardProps) {
  const dark = tone === "dark";
  return (
    <div
      className={className}
      data-testid="point-balance-card"
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      data-tone={tone}
      style={{
        borderRadius: radius.hero,
        padding: 20,
        background: dark
          ? `radial-gradient(circle at 82% 10%, ${colors.lime.soft}, transparent 38%), ${surfaceDark.panel}`
          : gradient.point,
        boxShadow: dark ? elevation.heroDark : elevation.raised,
        color: "#fff",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
        {label}
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
          // [03 레이아웃 강건성] 금액은 ellipsis 금지 — 확대로 카드 폭을 넘치면 줄바꿈으로 흐른다.
          overflowWrap: "anywhere",
        }}
      >
        {formatValue(available)}
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
        // [03 레이아웃 강건성] 고정 height 금지 — minHeight+padding으로 글자 확대 시 잘림 방지.
        minHeight: 48,
        padding: "8px 16px",
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

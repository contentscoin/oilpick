import { formatKg, formatKrw } from "@oilpick/core";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — CallCard(거리/수량/수거비).
 * 05-design-upgrade.md "CallCard(콜 카드)": 리치 카드 — 좌측 거리(큰 숫자+km),
 * 중앙 수량(kg)·주소(truncate), 우측 수거비 앰버 강조. 좌측 얇은 green 액센트 바.
 * apps/rider R2 콜 홈 목록에서 쓰인다. 거리 계산은 클라이언트 책임(03-frontend.md
 * "apps/rider" 표 R2 구현 요점) — 이 컴포넌트는 계산된 값만 받는다.
 */
export interface CallCardProps {
  /** 거리(km). 소수 1자리로 표시. */
  distanceKm: number;
  /** 예상 수거량(kg). */
  estimatedKg: number;
  /** 수거비(원). 주문 생성 시점 스냅샷 값. */
  pickupFee: number;
  /** 수거 주소(선택). 지정 시 중앙에 한 줄 truncate로 표시. */
  address?: string;
  onClick?: () => void;
  className?: string;
}

export function CallCard({
  distanceKm,
  estimatedKg,
  pickupFee,
  address,
  onClick,
  className,
}: CallCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={className}
      data-testid="call-card"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        textAlign: "left",
        border: `1px solid ${surface.border}`,
        cursor: onClick ? "pointer" : "default",
        borderRadius: radius.card,
        // 좌측 얇은 green 액센트 바.
        borderLeft: `4px solid ${colors.primary.DEFAULT}`,
        padding: "14px 16px",
        backgroundColor: surface.card,
        boxShadow: elevation.card,
        minHeight: 48,
      }}
    >
      {/* 좌: 거리 */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexShrink: 0 }}>
        <span
          className="oilpick-tabular-nums"
          style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: gray[900] }}
        >
          {distanceKm.toFixed(1)}
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>km</span>
        </span>
      </div>

      {/* 중앙: 수량 + 주소 */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
        <span className="oilpick-tabular-nums" style={{ fontSize: 15, fontWeight: 700 }}>
          {formatKg(estimatedKg)}
        </span>
        {address && (
          <span
            style={{
              fontSize: 13,
              color: colors.status.wait,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {address}
          </span>
        )}
      </div>

      {/* 우: 수거비(앰버 강조) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.status.wait }}>수거비</span>
        <span
          className="oilpick-tabular-nums"
          style={{ fontSize: 20, fontWeight: 800, color: colors.accent.DEFAULT, lineHeight: 1.1 }}
        >
          {formatKrw(pickupFee)}
        </span>
      </div>
    </Tag>
  );
}

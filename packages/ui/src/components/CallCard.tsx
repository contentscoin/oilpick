import { formatKg, formatKrw } from "@oilpick/core";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — CallCard(거리/수량/매입액).
 * 05-design-upgrade.md "CallCard(콜 카드)": 리치 카드 — 좌측 거리(큰 숫자+km),
 * 중앙 수량(kg)·주소(truncate). 좌측 얇은 green 액센트 바.
 * [08 G6-②] "쿠폰 N장 소진" 칩 제거(쿠폰 모델 폐기) — 우측은 "예상 매입 지급액 ₩M"
 * (requested_kg×시세, 라이더가 점주에게 현금 또는 포인트로 지급할 금액) 앰버 강조만.
 * apps/rider R2 콜 홈 목록에서 쓰인다. 거리·매입액 계산은 클라이언트 책임 —
 * 이 컴포넌트는 계산된 값만 받는다.
 */
export interface CallCardProps {
  /** 거리(km). 소수 1자리로 표시. null이면 좌표 없음/위치 미확보 — "—"로 표시. */
  distanceKm: number | null;
  /** 예상 수거량(kg). */
  estimatedKg: number;
  /** 예상 매입 지급액(원) = requested_kg × snapshot_price_per_kg. 현장에서 현금/포인트로 지급. */
  estimatedCash: number;
  /** 수거 주소(선택). 지정 시 중앙에 한 줄 truncate로 표시. */
  address?: string;
  onClick?: () => void;
  className?: string;
}

export function CallCard({
  distanceKm,
  estimatedKg,
  estimatedCash,
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
          {distanceKm == null ? "—" : distanceKm.toFixed(1)}
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

      {/* 우: 예상 매입 지급액(앰버 강조) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.status.wait }}>예상 매입 지급액</span>
        <span
          className="oilpick-tabular-nums"
          data-testid="call-card-cash"
          style={{ fontSize: 20, fontWeight: 800, color: colors.accent.deep, lineHeight: 1.1 }}
        >
          {formatKrw(estimatedCash)}
        </span>
      </div>
    </Tag>
  );
}

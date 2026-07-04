import { formatKg, formatKrw } from "@oilpick/core";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — CallCard(거리/수량/수거비).
 * apps/rider R2 콜 홈 목록에서 쓰이는 콜 요약 카드. 거리 계산은 클라이언트 책임(03-frontend.md
 * "apps/rider" 표 R2 구현 요점) — 이 컴포넌트는 계산된 값만 받는다.
 */
export interface CallCardProps {
  /** 거리(km). 소수 1자리로 표시. */
  distanceKm: number;
  /** 예상 수거량(kg). */
  estimatedKg: number;
  /** 수거비(원). 주문 생성 시점 스냅샷 값. */
  pickupFee: number;
  onClick?: () => void;
  className?: string;
}

export function CallCard({ distanceKm, estimatedKg, pickupFee, onClick, className }: CallCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={className}
      data-testid="call-card"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: onClick ? "pointer" : "default",
        borderRadius: radius.card,
        padding: 16,
        backgroundColor: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        minHeight: 48,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
          {distanceKm.toFixed(1)}km · {formatKg(estimatedKg)}
        </p>
        <p
          className="oilpick-tabular-nums"
          style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: colors.accent.DEFAULT }}
        >
          {formatKrw(pickupFee)}
        </p>
      </div>
    </Tag>
  );
}

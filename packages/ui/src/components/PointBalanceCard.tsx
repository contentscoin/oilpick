import { formatPoint } from "@oilpick/core";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PointBalanceCard.
 * "available 크게, held는 '지급 확정 대기 nP' 보조 표기" 그대로. held가 0이면 보조 표기 생략.
 */
export interface PointBalanceCardProps {
  /** 즉시 출금 가능한 잔액(P). v_point_balance.available. */
  available: number;
  /** 지급 확정 대기 중인 보류 포인트(P). v_point_balance.held. */
  held?: number;
  className?: string;
}

export function PointBalanceCard({ available, held = 0, className }: PointBalanceCardProps) {
  return (
    <div
      className={className}
      data-testid="point-balance-card"
      style={{
        borderRadius: radius.card,
        padding: 20,
        backgroundColor: colors.primary.light,
      }}
    >
      <p style={{ margin: 0, fontSize: 14, color: colors.primary.dark }}>보유 포인트</p>
      <p
        className="oilpick-tabular-nums"
        style={{ margin: "4px 0 0", fontSize: 36, fontWeight: 700, color: colors.primary.DEFAULT }}
      >
        {formatPoint(available)}
      </p>
      {held > 0 && (
        <p
          className="oilpick-tabular-nums"
          data-testid="point-balance-held"
          style={{ margin: "8px 0 0", fontSize: 14, color: colors.status.wait }}
        >
          지급 확정 대기 {formatPoint(held)}
        </p>
      )}
    </div>
  );
}

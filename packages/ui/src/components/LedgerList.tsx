import { formatPoint, formatRelativeTime } from "@oilpick/core";
import { colors } from "../tokens";
import { SwipeableRow } from "./SwipeableRow";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — LedgerList(원장 행: 타입 한글 라벨 + 부호 색상).
 * entry_type 값/한글 라벨은 00-domain.md "포인트 원장 규칙"을 그대로 옮긴 것.
 * packages/core에는 아직 이 라벨 맵이 export되어 있지 않아(T2 범위 밖) 이 컴포넌트 내부에
 * 로컬 상수로 둔다 — entry_type이 packages/core에 정식 타입으로 추가되면 이 맵을 그쪽으로
 * 옮기고 여기서는 import만 하도록 정리할 것.
 *
 * [07 F5] 쿠폰 원장 재사용: `variant="coupon"`이면 쿠폰 entry_type 라벨(충전/콜 배정/환급/조정) +
 * 수량 단위("장")로 렌더한다(03-frontend.md "PointBalanceCard/LedgerList는 쿠폰 잔액/원장으로
 * 일반화 재사용"). 포인트("P")가 기본값이라 기존 사용처는 무영향.
 */
export type PointLedgerEntryType =
  | "EARN"
  | "HOLD"
  | "RELEASE"
  | "WITHDRAW_REQUEST"
  | "WITHDRAW_CANCEL"
  | "ADJUST"
  | "PURCHASE"
  | "TRADE_PURCHASE"
  | "REFERRAL";

/** [07 F2/F5] 쿠폰 원장 entry_type(coupon_entry_type enum). ADJUST는 포인트와 값이 겹치나 라벨이 다르다. */
export type CouponLedgerEntryType = "CHARGE" | "CONSUME" | "REFUND" | "ADJUST";

/** 하위호환: 기존 코드가 참조하는 이름 유지(포인트 원장 타입). */
export type LedgerEntryType = PointLedgerEntryType;

export const LEDGER_ENTRY_LABEL: Record<PointLedgerEntryType, string> = {
  EARN: "매각대금",
  HOLD: "수거비 보류",
  RELEASE: "보류 확정",
  WITHDRAW_REQUEST: "출금 신청",
  WITHDRAW_CANCEL: "출금 반려 복구",
  ADJUST: "관리자 조정",
  PURCHASE: "쇼핑몰 결제",
  TRADE_PURCHASE: "새 기름 결제(차감)",
  REFERRAL: "추천 보너스",
};

/** [07 F5] 쿠폰 원장 라벨(07 §1-1 entry_type). CHARGE 충전 / CONSUME 콜 배정 소진 / REFUND 귀책 환급 / ADJUST 관리자 조정. */
export const COUPON_LEDGER_ENTRY_LABEL: Record<CouponLedgerEntryType, string> = {
  CHARGE: "충전",
  CONSUME: "콜 배정",
  REFUND: "환급",
  ADJUST: "조정",
};

export type LedgerVariant = "point" | "coupon";

export interface LedgerEntry {
  id: string | number;
  /** 포인트/쿠폰 원장 공통 entry_type. variant에 맞는 라벨 맵으로 해석된다. */
  entryType: PointLedgerEntryType | CouponLedgerEntryType;
  /** 부호 있는 값(포인트=P, 쿠폰=장 수). 양수=증가, 음수=감소. 00-domain.md "부호 규칙". */
  amount: number;
  createdAt: Date | string | number;
  memo?: string;
}

export interface LedgerListProps {
  entries: LedgerEntry[];
  /** "point"(기본, P 단위) 또는 "coupon"(장 단위·쿠폰 라벨). 07 F5 쿠폰 내역 화면용. */
  variant?: LedgerVariant;
  /**
   * [15] 넘기면 각 행이 좌스와이프로 액션을 드러내는 카드가 된다(SwipeableRow).
   * 넘기지 않으면 기존 구분선 목록 그대로 — 기존 사용처는 무영향.
   */
  onRowAction?: (entry: LedgerEntry) => void;
  /** onRowAction과 짝. 드러나는 액션 라벨. 기본 "영수증". */
  rowActionLabel?: string;
  className?: string;
}

/** 쿠폰 수량 표시(절댓값). 부호는 상위에서 색/접두로 처리하므로 여기선 |n|장만. */
function formatCouponQty(n: number): string {
  return `${Math.abs(Math.trunc(n)).toLocaleString("ko-KR")}장`;
}

export function LedgerList({
  entries,
  variant = "point",
  onRowAction,
  rowActionLabel = "영수증",
  className,
}: LedgerListProps) {
  const labelOf = (entryType: LedgerEntry["entryType"]): string =>
    variant === "coupon"
      ? (COUPON_LEDGER_ENTRY_LABEL[entryType as CouponLedgerEntryType] ?? entryType)
      : (LEDGER_ENTRY_LABEL[entryType as PointLedgerEntryType] ?? entryType);
  const swipeable = Boolean(onRowAction);

  return (
    <ul
      className={className}
      data-testid="ledger-list"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        ...(swipeable ? { display: "grid", gap: 8 } : null),
      }}
    >
      {entries.map((entry) => {
        const isPositive = entry.amount >= 0;
        const color = isPositive ? colors.primary.DEFAULT : colors.status.danger;
        const magnitude =
          variant === "coupon" ? formatCouponQty(entry.amount) : formatPoint(Math.abs(entry.amount));

        const body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: swipeable ? "12px 14px" : "12px 0",
              minHeight: 48,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{labelOf(entry.entryType)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: colors.status.wait }}>
                {entry.memo ?? formatRelativeTime(entry.createdAt)}
              </p>
            </div>
            <span className="oilpick-tabular-nums" style={{ fontSize: 16, fontWeight: 700, color }}>
              {isPositive ? "+" : "-"}
              {magnitude}
            </span>
          </div>
        );

        return (
          <li
            key={entry.id}
            data-testid="ledger-list-row"
            style={swipeable ? undefined : { borderBottom: "1px solid #f4f4f5" }}
          >
            {onRowAction ? (
              <SwipeableRow actionLabel={rowActionLabel} onAction={() => onRowAction(entry)}>
                {body}
              </SwipeableRow>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

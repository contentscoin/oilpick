import { formatPoint, formatRelativeTime } from "@oilpick/core";
import { colors } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — LedgerList(원장 행: 타입 한글 라벨 + 부호 색상).
 * entry_type 값/한글 라벨은 00-domain.md "포인트 원장 규칙"을 그대로 옮긴 것.
 * packages/core에는 아직 이 라벨 맵이 export되어 있지 않아(T2 범위 밖) 이 컴포넌트 내부에
 * 로컬 상수로 둔다 — entry_type이 packages/core에 정식 타입으로 추가되면 이 맵을 그쪽으로
 * 옮기고 여기서는 import만 하도록 정리할 것.
 */
export type LedgerEntryType =
  | "EARN"
  | "HOLD"
  | "RELEASE"
  | "WITHDRAW_REQUEST"
  | "WITHDRAW_CANCEL"
  | "ADJUST"
  | "PURCHASE";

export const LEDGER_ENTRY_LABEL: Record<LedgerEntryType, string> = {
  EARN: "매각대금",
  HOLD: "수거비 보류",
  RELEASE: "보류 확정",
  WITHDRAW_REQUEST: "출금 신청",
  WITHDRAW_CANCEL: "출금 반려 복구",
  ADJUST: "관리자 조정",
  PURCHASE: "쇼핑몰 결제",
};

export interface LedgerEntry {
  id: string | number;
  entryType: LedgerEntryType;
  /** 부호 있는 금액(P). 양수=증가, 음수=감소. 00-domain.md "부호 규칙". */
  amount: number;
  createdAt: Date | string | number;
  memo?: string;
}

export interface LedgerListProps {
  entries: LedgerEntry[];
  className?: string;
}

export function LedgerList({ entries, className }: LedgerListProps) {
  return (
    <ul className={className} data-testid="ledger-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {entries.map((entry) => {
        const isPositive = entry.amount >= 0;
        const color = isPositive ? colors.primary.DEFAULT : colors.status.danger;
        return (
          <li
            key={entry.id}
            data-testid="ledger-list-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 0",
              borderBottom: "1px solid #f4f4f5",
              minHeight: 48,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                {LEDGER_ENTRY_LABEL[entry.entryType]}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: colors.status.wait }}>
                {entry.memo ?? formatRelativeTime(entry.createdAt)}
              </p>
            </div>
            <span
              className="oilpick-tabular-nums"
              style={{ fontSize: 16, fontWeight: 700, color }}
            >
              {isPositive ? "+" : ""}
              {formatPoint(entry.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import { colors, radius, surface } from "../tokens";

/**
 * 08-payout-pivot.md Q절(2026-08-06 CEO 확정) — 지급·출금 세금/수수료 안내.
 * 지급 형태별 세무 기준과 출금 수수료를 사용자에게 설명하는 공용 카드. 정책 문구의 단일 진실은
 * 08 Q2이며, 이 컴포넌트가 유일한 렌더 경로다(앱별 중복 정의 금지 — CLAUDE.md 7).
 *
 * context별 노출 항목(08 Q3):
 * - "measure": 지급수단 선택/확인 옆 — 포인트=부가세 포함 / 현금(개인)=부가세 제외 후 3.3% 공제 /
 *   세금계산서(사업자)=부가세 포함.
 * - "wallet": 지갑 — 포인트=부가세 포함 + 플랫폼 내 사용 무공제 + 출금 요약 한 줄.
 * - "withdraw": 출금 신청 — 3.3% 공제·사업자 정보 시 부가세 포함(+세금계산서)·수수료 1,000P.
 */
export interface PayoutTaxNoticeProps {
  context: "measure" | "wallet" | "withdraw";
  className?: string;
  "data-testid"?: string;
}

const NOTICE_LINES: Record<PayoutTaxNoticeProps["context"], string[]> = {
  measure: [
    "포인트로 받으면 부가세가 포함된 금액이에요.",
    "현금(개인)으로 받으면 부가세를 뺀 금액에서 사업소득 원천징수 3.3%를 공제한 뒤 지급해요.",
    "사업자 정보로 세금계산서를 발행하면 부가세가 포함된 금액을 지급해요.",
  ],
  wallet: [
    "포인트는 부가세가 포함된 금액이에요. 플랫폼 안에서 포인트로 사용하면 어떤 공제도 없어요.",
    "현금으로 환급(출금)할 때는 기본 3.3% 공제 후 본인 명의 계좌로 입금되고, 1회당 수수료 1,000P가 차감돼요.",
  ],
  withdraw: [
    "출금액은 기본적으로 사업소득 원천징수 3.3%를 공제한 뒤 지정된 명의(예금주) 계좌로 입금돼요.",
    "사업자 정보를 등록하면 부가세를 포함한 금액을 지급하고 세금계산서를 발행해요.",
    "출금 신청 1회당 수수료 1,000P가 포인트에서 함께 차감돼요.",
    "플랫폼 안에서 포인트로 사용하면 어떤 공제도 없어요.",
  ],
};

export function PayoutTaxNotice({ context, className, "data-testid": testId }: PayoutTaxNoticeProps) {
  return (
    <div
      data-testid={testId ?? "payout-tax-notice"}
      className={className}
      style={{
        borderRadius: radius.card,
        border: `1px solid ${surface.border}`,
        backgroundColor: surface.card,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.status.wait }}>세금·수수료 안내</p>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {NOTICE_LINES[context].map((line) => (
          <li key={line} style={{ fontSize: 12, lineHeight: 1.5, color: colors.status.wait, overflowWrap: "anywhere" }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LedgerList } from "./LedgerList";

describe("LedgerList", () => {
  it("renders entries with Korean type labels and signed amounts", () => {
    render(
      <LedgerList
        entries={[
          { id: 1, entryType: "EARN", amount: 54000, createdAt: new Date() },
          { id: 2, entryType: "WITHDRAW_REQUEST", amount: -20000, createdAt: new Date() },
          { id: 3, entryType: "REFERRAL", amount: 5000, createdAt: new Date() },
        ]}
      />,
    );
    expect(screen.getByText("매각대금")).toBeInTheDocument();
    expect(screen.getByText("+54,000P")).toBeInTheDocument();
    expect(screen.getByText("출금 신청")).toBeInTheDocument();
    expect(screen.getByText("-20,000P")).toBeInTheDocument();
    // [09 H4] 추천 보너스 — 라벨 맵에서 REFERRAL이 빠지면 raw enum으로 폴백해 조용히 깨진다.
    expect(screen.getByText("추천 보너스")).toBeInTheDocument();
    expect(screen.getByText("+5,000P")).toBeInTheDocument();
  });

  it("[07 F5] renders coupon variant with 장 units and coupon labels (4 entry types)", () => {
    render(
      <LedgerList
        variant="coupon"
        entries={[
          { id: 1, entryType: "CHARGE", amount: 30, createdAt: new Date() },
          { id: 2, entryType: "CONSUME", amount: -1, createdAt: new Date() },
          { id: 3, entryType: "REFUND", amount: 1, createdAt: new Date() },
          { id: 4, entryType: "ADJUST", amount: 20, memo: "데모 선지급", createdAt: new Date() },
        ]}
      />,
    );
    // 4 entry_type 라벨(07 §1-1) + 장 단위 부호 표기.
    expect(screen.getByText("충전")).toBeInTheDocument();
    expect(screen.getByText("+30장")).toBeInTheDocument();
    expect(screen.getByText("콜 배정")).toBeInTheDocument();
    expect(screen.getByText("-1장")).toBeInTheDocument();
    expect(screen.getByText("환급")).toBeInTheDocument();
    expect(screen.getByText("+1장")).toBeInTheDocument();
    expect(screen.getByText("조정")).toBeInTheDocument();
    expect(screen.getByText("+20장")).toBeInTheDocument();
    // ADJUST memo(사유)가 부제로 노출.
    expect(screen.getByText("데모 선지급")).toBeInTheDocument();
  });
});

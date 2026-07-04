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
        ]}
      />,
    );
    expect(screen.getByText("매각대금")).toBeInTheDocument();
    expect(screen.getByText("+54,000P")).toBeInTheDocument();
    expect(screen.getByText("출금 신청")).toBeInTheDocument();
    expect(screen.getByText("-20,000P")).toBeInTheDocument();
  });
});

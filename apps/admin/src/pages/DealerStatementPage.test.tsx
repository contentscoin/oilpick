import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealerStatementPage } from "./DealerStatementPage";

// [16 L7] 정산 셀프서비스 — 미정산 라인(usage 대사) + 청구 행별 CSV.
const { mockUseDealerStatements, mockUseDealerSettlements, mockUseDealerUnsettledOrders, mockDownloadCsv } = vi.hoisted(
  () => ({
    mockUseDealerStatements: vi.fn(),
    mockUseDealerSettlements: vi.fn(),
    mockUseDealerUnsettledOrders: vi.fn(),
    mockDownloadCsv: vi.fn(),
  }),
);
vi.mock("../hooks/useDealersAdmin", () => ({
  useDealerStatements: () => mockUseDealerStatements(),
  useDealerSettlements: () => mockUseDealerSettlements(),
  useDealerUnsettledOrders: () => mockUseDealerUnsettledOrders(),
}));
vi.mock("../lib/settlementCsv", () => ({ downloadSettlementCsv: mockDownloadCsv }));

const STMT = {
  dealer_id: "d1",
  deposit_amount: 10_000_000,
  credit_limit: 14_000_000,
  claim_threshold: 5_000_000,
  fee_rate_bp: 0,
  usage: 40_000,
  headroom: 13_960_000,
  over_threshold: false,
};

describe("DealerStatementPage — 정산 셀프서비스(16 L7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDealerStatements.mockReturnValue({ data: [STMT], isLoading: false });
    mockUseDealerSettlements.mockReturnValue({ data: [] });
    mockUseDealerUnsettledOrders.mockReturnValue({ data: [] });
    mockDownloadCsv.mockResolvedValue(true);
  });

  it("미정산 내역 — 주문 라인 + 포인트 순액 합계가 usage 카드와 1:1 대사된다", () => {
    mockUseDealerUnsettledOrders.mockReturnValue({
      data: [
        { order_id: "o1-aaaaaaaa", payout_method: "POINT", cash_paid_amount: 64000, purchase_amount: 24000, net_amount: 40000, completed_at: "2026-08-01T00:00:00Z" },
        { order_id: "o2-bbbbbbbb", payout_method: "CASH", cash_paid_amount: 30000, purchase_amount: 0, net_amount: 30000, completed_at: "2026-08-01T01:00:00Z" },
      ],
    });
    render(<DealerStatementPage />);
    expect(screen.getByTestId("unsettled-o1-aaaaaaaa")).toBeInTheDocument();
    // 합계는 POINT분(40,000P)만 — CASH는 정산 무관(14 §4). usage 카드(40,000P)와 일치.
    expect(screen.getByTestId("dealer-unsettled-total")).toHaveTextContent("40,000P");
  });

  it("미정산이 없으면 빈 문구·합계 행 없음", () => {
    render(<DealerStatementPage />);
    expect(screen.getByTestId("dealer-unsettled")).toHaveTextContent("미정산 주문이 없어요");
    expect(screen.queryByTestId("dealer-unsettled-total")).not.toBeInTheDocument();
  });

  it("청구 이력 행 [CSV]가 공용 다운로드를 호출한다(본사 왕복 제거)", async () => {
    mockUseDealerSettlements.mockReturnValue({
      data: [
        { id: "s1", dealer_id: "d1", status: "CLAIMED", point_minted: 40000, point_spent: 0, fee_amount: 0, net_due: 40000, claimed_at: "2026-08-01T00:00:00Z" },
      ],
    });
    render(<DealerStatementPage />);
    fireEvent.click(screen.getByTestId("statement-csv-s1"));
    await waitFor(() => expect(mockDownloadCsv).toHaveBeenCalledWith("s1"));
  });
});

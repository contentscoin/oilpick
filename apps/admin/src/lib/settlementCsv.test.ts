// [16 L7] 정산 CSV 직렬화 — gross(waste_amount)/net 구분 컬럼 계약 고정.
import { describe, expect, it, vi } from "vitest";

// settlementCsv가 다운로드 경로에서 supabaseClient를 import한다 — 순수 직렬화 테스트에는
// 클라이언트가 필요 없으므로 env 없이도 로드되게 목 처리.
vi.mock("./supabaseClient", () => ({ supabase: {} }));

import { settlementOrdersToCsv } from "./settlementCsv";
import { CSV_BOM } from "./csv";

describe("settlementOrdersToCsv", () => {
  it("뷰 실컬럼 그대로 — waste(gross)와 net을 나란히, null은 0/빈 값", () => {
    const csv = settlementOrdersToCsv([
      {
        order_id: "o1",
        payout_method: "POINT",
        cash_paid_amount: 64000,
        purchase_amount: 24000,
        net_amount: 40000,
        completed_at: "2026-08-01T00:00:00Z",
      },
      { order_id: "o2", payout_method: null, cash_paid_amount: null, purchase_amount: null, net_amount: null, completed_at: null },
    ]);
    const lines = csv.replace(CSV_BOM, "").split("\r\n");
    expect(lines[0]).toBe("order_id,payout_method,waste_amount,purchase_amount,net_amount,completed_at");
    expect(lines[1]).toBe("o1,POINT,64000,24000,40000,2026-08-01T00:00:00Z");
    expect(lines[2]).toBe("o2,,0,0,0,");
  });
});

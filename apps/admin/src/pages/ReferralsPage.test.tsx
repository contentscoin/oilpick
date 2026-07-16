import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralsPage } from "./ReferralsPage";
import type { ReferralDailyRow, ReferralStatRow } from "../hooks/useReferralAdmin";

/** 정산 큐가 useQueryClient(invalidate)를 쓰므로 실제 앱과 동일하게 프로바이더로 감싼다. */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReferralsPage />
    </QueryClientProvider>,
  );
}

// 09 H4【A】레퍼럴 실적분석 — 요약 KPI + 라이더별 퍼널 + 일별 추이 + CSV.
// 훅(useReferralAdmin)과 CSV 유틸을 모킹해 표시/집계 로직만 검증한다.

const {
  mockUseReferralStatsAdmin,
  mockUseReferralDaily,
  mockUseUnsettledReferrals,
  mockToCsv,
  mockDownloadCsv,
  mockInvokeEdgeFunction,
} = vi.hoisted(() => ({
  mockUseReferralStatsAdmin: vi.fn(),
  mockUseReferralDaily: vi.fn(),
  mockUseUnsettledReferrals: vi.fn(),
  mockToCsv: vi.fn(() => "csv"),
  mockDownloadCsv: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));

vi.mock("../hooks/useReferralAdmin", () => ({
  useReferralStatsAdmin: () => mockUseReferralStatsAdmin(),
  useReferralDaily: (days: number) => mockUseReferralDaily(days),
  useUnsettledReferrals: () => mockUseUnsettledReferrals(),
}));
vi.mock("../lib/csv", () => ({ toCsv: mockToCsv, downloadCsv: mockDownloadCsv }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

const STATS: ReferralStatRow[] = [
  { riderId: "r1", riderName: "김라이더", signedUp: 4, activated: 3, conversion: 75, supplierBonusPaid: 15000, riderRewardEarned: 9000, riderRewardSettled: 3000, riderRewardUnsettled: 6000 },
  { riderId: "r2", riderName: "이라이더", signedUp: 2, activated: 0, conversion: 0, supplierBonusPaid: 0, riderRewardEarned: 0, riderRewardSettled: 0, riderRewardUnsettled: 0 },
];
const UNSETTLED = [
  { id: "ref-1", riderId: "r1", riderName: "김라이더", supplierId: "s1", supplierName: "행복식당", riderReward: 3000, activatedAt: "2026-07-15T00:00:00Z" },
  { id: "ref-2", riderId: "r1", riderName: "김라이더", supplierId: "s2", supplierName: "만족식당", riderReward: 3000, activatedAt: "2026-07-16T00:00:00Z" },
];
const DAILY: ReferralDailyRow[] = [
  { day: "2026-07-14", signedUp: 3, activated: 1 },
  { day: "2026-07-15", signedUp: 1, activated: 2 },
];

describe("ReferralsPage (09 H4 admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReferralStatsAdmin.mockReturnValue(ok(STATS));
    mockUseReferralDaily.mockReturnValue(ok(DAILY));
    mockUseUnsettledReferrals.mockReturnValue(ok(UNSETTLED));
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { referralId: "ref-1", settled: true, settledAt: "2026-07-16T01:00:00Z" } });
  });

  it("요약 KPI를 전체 합산으로 렌더한다(전환율 = 3/6 = 50%)", () => {
    renderPage();
    expect(screen.getByTestId("kpi-signed-up").textContent).toContain("6");
    expect(screen.getByTestId("kpi-activated").textContent).toContain("3");
    expect(screen.getByTestId("kpi-conversion").textContent).toContain("50%");
    expect(screen.getByTestId("kpi-bonus").textContent).toContain("15,000");
  });

  it("라이더별 퍼널 행을 렌더한다", () => {
    renderPage();
    const table = screen.getByTestId("referral-funnel-table");
    expect(within(table).getByText("김라이더")).toBeInTheDocument();
    expect(within(table).getByText("이라이더")).toBeInTheDocument();
    expect(within(table).getByText("75%")).toBeInTheDocument();
  });

  it("일별 추이 행을 렌더한다", () => {
    renderPage();
    const table = screen.getByTestId("referral-daily-table");
    expect(within(table).getByText("2026-07-14")).toBeInTheDocument();
    expect(within(table).getByText("2026-07-15")).toBeInTheDocument();
  });

  it("CSV 내보내기 버튼이 toCsv/downloadCsv를 호출한다", () => {
    renderPage();
    screen.getByTestId("referral-csv-button").click();
    expect(mockToCsv).toHaveBeenCalled();
    expect(mockDownloadCsv).toHaveBeenCalledWith("레퍼럴_실적", "csv");
  });

  // ===== [09 H8] 보상 정산 큐 =====

  it("정산 큐가 미지급 합계와 행을 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("settle-unsettled-total").textContent).toContain("6,000원");
    const table = screen.getByTestId("settle-queue-table");
    expect(within(table).getByText("행복식당")).toBeInTheDocument();
    expect(within(table).getByText("만족식당")).toBeInTheDocument();
  });

  it("[지급 완료] 클릭이 referral-settle Edge를 호출한다", async () => {
    renderPage();
    screen.getByTestId("settle-button-ref-1").click();
    await vi.waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith("referral-settle", { referralId: "ref-1", settle: true }),
    );
  });

  it("정산 실패 메시지를 표면화한다", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({ ok: false, message: "지금은 처리할 수 없는 상태예요." });
    renderPage();
    screen.getByTestId("settle-button-ref-1").click();
    expect(await screen.findByTestId("settle-error")).toHaveTextContent("지금은 처리할 수 없는 상태예요.");
  });

  it("퍼널 테이블에 정산 완료/미지급 컬럼을 렌더한다", () => {
    renderPage();
    const table = screen.getByTestId("referral-funnel-table");
    expect(within(table).getByText("3,000원")).toBeInTheDocument(); // 김라이더 정산 완료
    expect(within(table).getByText("6,000원")).toBeInTheDocument(); // 김라이더 미지급
  });
});

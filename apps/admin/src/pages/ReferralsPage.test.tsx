import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralsPage } from "./ReferralsPage";
import type { ReferralDailyRow, ReferralStatRow } from "../hooks/useReferralAdmin";

// 09 H4【A】레퍼럴 실적분석 — 요약 KPI + 라이더별 퍼널 + 일별 추이 + CSV.
// 훅(useReferralAdmin)과 CSV 유틸을 모킹해 표시/집계 로직만 검증한다.

const { mockUseReferralStatsAdmin, mockUseReferralDaily, mockToCsv, mockDownloadCsv } = vi.hoisted(
  () => ({
    mockUseReferralStatsAdmin: vi.fn(),
    mockUseReferralDaily: vi.fn(),
    mockToCsv: vi.fn(() => "csv"),
    mockDownloadCsv: vi.fn(),
  }),
);

vi.mock("../hooks/useReferralAdmin", () => ({
  useReferralStatsAdmin: () => mockUseReferralStatsAdmin(),
  useReferralDaily: (days: number) => mockUseReferralDaily(days),
}));
vi.mock("../lib/csv", () => ({ toCsv: mockToCsv, downloadCsv: mockDownloadCsv }));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

const STATS: ReferralStatRow[] = [
  { riderId: "r1", riderName: "김라이더", signedUp: 4, activated: 3, conversion: 75, supplierBonusPaid: 15000, riderRewardEarned: 9000 },
  { riderId: "r2", riderName: "이라이더", signedUp: 2, activated: 0, conversion: 0, supplierBonusPaid: 0, riderRewardEarned: 0 },
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
  });

  it("요약 KPI를 전체 합산으로 렌더한다(전환율 = 3/6 = 50%)", () => {
    render(<ReferralsPage />);
    expect(screen.getByTestId("kpi-signed-up").textContent).toContain("6");
    expect(screen.getByTestId("kpi-activated").textContent).toContain("3");
    expect(screen.getByTestId("kpi-conversion").textContent).toContain("50%");
    expect(screen.getByTestId("kpi-bonus").textContent).toContain("15,000");
  });

  it("라이더별 퍼널 행을 렌더한다", () => {
    render(<ReferralsPage />);
    const table = screen.getByTestId("referral-funnel-table");
    expect(within(table).getByText("김라이더")).toBeInTheDocument();
    expect(within(table).getByText("이라이더")).toBeInTheDocument();
    expect(within(table).getByText("75%")).toBeInTheDocument();
  });

  it("일별 추이 행을 렌더한다", () => {
    render(<ReferralsPage />);
    const table = screen.getByTestId("referral-daily-table");
    expect(within(table).getByText("2026-07-14")).toBeInTheDocument();
    expect(within(table).getByText("2026-07-15")).toBeInTheDocument();
  });

  it("CSV 내보내기 버튼이 toCsv/downloadCsv를 호출한다", () => {
    render(<ReferralsPage />);
    screen.getByTestId("referral-csv-button").click();
    expect(mockToCsv).toHaveBeenCalled();
    expect(mockDownloadCsv).toHaveBeenCalledWith("레퍼럴_실적", "csv");
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EarningsPage } from "./EarningsPage";

const { mockUseSession, mockUseMonthlyPickupStats, mockUseMyPayout, mockUseMyPayoutOrders } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseMonthlyPickupStats: vi.fn(),
  mockUseMyPayout: vi.fn(),
  mockUseMyPayoutOrders: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useTodayStats", () => ({ useMonthlyPickupStats: mockUseMonthlyPickupStats }));
vi.mock("../hooks/useMyPayout", () => ({ useMyPayout: mockUseMyPayout, useMyPayoutOrders: mockUseMyPayoutOrders }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/earnings"]}>
      <Routes>
        <Route path="/earnings" element={<EarningsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseMonthlyPickupStats.mockReturnValue({
    data: { count: 4, kg: 105, cash: 64000, point: 10500, cashCount: 3, pointCount: 1 },
    isLoading: false,
  });
  mockUseMyPayout.mockReturnValue({ data: { days: [], monthPointTotal: 0 } });
  mockUseMyPayoutOrders.mockReturnValue({ data: undefined });
});

describe("EarningsPage — 플랫폼 정산 카드(16 L9 §6-2)", () => {
  it("이번 달 포인트 지급분 합계 + 오프라인 정산 캡션(지갑 오해 차단)", () => {
    mockUseMyPayout.mockReturnValue({
      data: {
        days: [
          { day: "2026-08-01", completedCount: 1, totalKg: 40, cashAmount: 0, pointAmount: 28000, pointSpentAmount: 0 },
        ],
        monthPointTotal: 28000,
      },
    });
    renderPage();
    const card = screen.getByTestId("my-payout-card");
    expect(screen.getByTestId("my-payout-total")).toHaveTextContent("28,000P");
    expect(card).toHaveTextContent("오프라인 정산 대상 금액");
    expect(card).toHaveTextContent("지급 일정은 본사 안내");
  });

  it("실적이 없으면 0P", () => {
    renderPage();
    expect(screen.getByTestId("my-payout-total")).toHaveTextContent("0P");
  });
});

describe("EarningsPage — 일별 지급 내역(현금·포인트 병기)", () => {
  it("일별 행에 건수/kg + 현금·포인트 지급액을 병기한다", () => {
    mockUseMyPayout.mockReturnValue({
      data: {
        days: [
          { day: "2026-08-03", completedCount: 2, totalKg: 55, cashAmount: 30000, pointAmount: 0, pointSpentAmount: 0 },
          { day: "2026-08-01", completedCount: 1, totalKg: 40, cashAmount: 0, pointAmount: 28000, pointSpentAmount: 0 },
        ],
        monthPointTotal: 28000,
      },
    });
    renderPage();
    const card = screen.getByTestId("daily-payout-card");
    expect(card).toHaveTextContent("08.03 · 2건 · 55.0kg");
    expect(card).toHaveTextContent("💵 30,000원 · 🪙 0P");
    expect(card).toHaveTextContent("08.01 · 1건 · 40.0kg");
    expect(card).toHaveTextContent("💵 0원 · 🪙 28,000P");
    // 지갑 오해 차단 — 현금은 현장 지급 완료분임을 명시.
    expect(card).toHaveTextContent("현금은 현장에서 지급받은 금액이에요");
  });

  it("상계 차액을 점주에게 지급한 날은 현금이 음수로 부호 보존된다(v_my_payout_daily 규약)", () => {
    mockUseMyPayout.mockReturnValue({
      data: {
        days: [
          { day: "2026-08-02", completedCount: 1, totalKg: 12, cashAmount: -3000, pointAmount: 0, pointSpentAmount: 0 },
        ],
        monthPointTotal: 0,
      },
    });
    renderPage();
    expect(screen.getByTestId("daily-payout-card")).toHaveTextContent("💵 -3,000원");
  });

  it("실적이 없으면 일별 내역 카드 미노출", () => {
    renderPage();
    expect(screen.queryByTestId("daily-payout-card")).not.toBeInTheDocument();
  });

  it("날짜 행을 펼치면 건별 내역(주소·kg·지급액)이 보인다 — net 규약·수단별 표기", () => {
    mockUseMyPayout.mockReturnValue({
      data: {
        days: [
          { day: "2026-08-03", completedCount: 2, totalKg: 60, cashAmount: -3000, pointAmount: 28000, pointSpentAmount: 0 },
        ],
        monthPointTotal: 28000,
      },
    });
    mockUseMyPayoutOrders.mockReturnValue({
      data: {
        "2026-08-03": [
          // 상계 주문 — net 음수(점주에게 지급)가 부호 그대로 보인다.
          { id: "a", completedAt: "2026-08-03T05:00:00+00:00", pickupAddress: "서울 중구 세종대로 110", finalKg: 40, payoutMethod: "CASH", amount: -3000 },
          { id: "b", completedAt: "2026-08-03T07:00:00+00:00", pickupAddress: "서울 마포구 양화로 45", finalKg: 20, payoutMethod: "POINT", amount: 28000 },
        ],
      },
    });
    renderPage();
    const orders = screen.getByTestId("daily-payout-orders-2026-08-03");
    expect(orders).toHaveTextContent("서울 중구 세종대로 110");
    expect(orders).toHaveTextContent("40.0kg");
    expect(orders).toHaveTextContent("💵 -3,000원");
    expect(orders).toHaveTextContent("서울 마포구 양화로 45");
    expect(orders).toHaveTextContent("🪙 28,000P");
    // 완료 시각(HH:MM 로컬) 표기 — TZ 무관하게 형식만 확인.
    expect(orders).toHaveTextContent(/\d{2}:\d{2}/);
  });

  it("지급이 없던 완료 주문(레거시)은 '지급 없음'으로 표기한다", () => {
    mockUseMyPayout.mockReturnValue({
      data: {
        days: [{ day: "2026-08-02", completedCount: 1, totalKg: 10, cashAmount: 0, pointAmount: 0, pointSpentAmount: 0 }],
        monthPointTotal: 0,
      },
    });
    mockUseMyPayoutOrders.mockReturnValue({
      data: {
        "2026-08-02": [
          { id: "c", completedAt: "2026-08-02T07:00:00+00:00", pickupAddress: "매장 C", finalKg: null, payoutMethod: "CASH", amount: null },
        ],
      },
    });
    renderPage();
    expect(screen.getByTestId("daily-payout-orders-2026-08-02")).toHaveTextContent("지급 없음");
  });
});

describe("EarningsPage → 수거 실적(08 G6-④, 수단 분리)", () => {
  it("이번 달 현금/포인트 지급 분리 히어로(건수 병기) + 건수/kg 카드", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "수거 실적" })).toBeInTheDocument();
    expect(screen.getByTestId("monthly-cash-amount")).toHaveTextContent("64,000원");
    expect(screen.getByTestId("monthly-point-amount")).toHaveTextContent("10,500P");
    expect(screen.getByTestId("monthly-cash")).toHaveTextContent("현금 지급 · 3건");
    expect(screen.getByTestId("monthly-cash")).toHaveTextContent("포인트 지급 · 1건");
    expect(screen.getByTestId("monthly-count")).toHaveTextContent("4건");
    expect(screen.getByTestId("monthly-kg")).toHaveTextContent("105.0kg");
  });

  it("쿠폰 요약·충전 링크·포인트 잔액/출금 UI가 없다(08 P1·P5)", () => {
    renderPage();
    expect(screen.queryByTestId("coupon-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-ledger-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-charge-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("withdraw-request-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("point-balance-card")).not.toBeInTheDocument();
  });

  it("로딩 중에는 스켈레톤을 렌더한다", () => {
    mockUseMonthlyPickupStats.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId("stats-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("monthly-cash")).not.toBeInTheDocument();
  });
});

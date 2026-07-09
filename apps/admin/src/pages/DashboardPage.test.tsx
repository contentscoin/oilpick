import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import type { DashboardKpi } from "../hooks/useDashboard";

/**
 * DashboardPage KPI 카드 교체(07 F10-④) 렌더 검증:
 * - 신 KPI 6종: 오늘 주문/수거 kg/쿠폰 판매액/소진 쿠폰/활성 라이더/현금 거래액
 * - "오늘 발행 포인트" 카드 부재(D1 포인트 폐기)
 */

const { mockOrders, mockRiders, mockKpi } = vi.hoisted(() => ({
  mockOrders: vi.fn(),
  mockRiders: vi.fn(),
  mockKpi: vi.fn(),
}));

vi.mock("../hooks/useDashboard", () => ({
  useDashboardOrders: () => mockOrders(),
  useDashboardRiders: () => mockRiders(),
  useDashboardKpi: () => mockKpi(),
}));
// MapView는 카카오 SDK placeholder — 지도는 이 테스트 범위 밖이라 목킹.
vi.mock("@oilpick/ui", () => ({ MapView: () => <div data-testid="mock-map" /> }));
vi.mock("../lib/env", () => ({ KAKAO_KEY: "" }));

function setup(kpi: DashboardKpi) {
  mockOrders.mockReturnValue({ data: [], isLoading: false });
  mockRiders.mockReturnValue({ data: [], isLoading: false });
  mockKpi.mockReturnValue({ data: kpi, isLoading: false });
  return render(<DashboardPage />);
}

afterEach(() => {
  mockOrders.mockReset();
  mockRiders.mockReset();
  mockKpi.mockReset();
});

describe("DashboardPage KPI (07 F10-④)", () => {
  it("신 KPI 6종을 렌더한다 — 쿠폰 판매액/소진 쿠폰/현금 거래액 포함", () => {
    setup({
      orderCount: 4,
      collectedKg: 35.5,
      couponSalesAmount: 42000,
      consumedCoupons: 5,
      activeRiderCount: 3,
      cashPaidAmount: 31950,
    });

    expect(screen.getByText("오늘 주문 수")).toBeInTheDocument();
    expect(screen.getByText("4건")).toBeInTheDocument();
    expect(screen.getByText("오늘 수거 kg")).toBeInTheDocument();
    expect(screen.getByText("35.5kg")).toBeInTheDocument();
    expect(screen.getByText("오늘 쿠폰 판매액")).toBeInTheDocument();
    expect(screen.getByText("42,000원")).toBeInTheDocument();
    expect(screen.getByText("오늘 소진 쿠폰")).toBeInTheDocument();
    expect(screen.getByText("5장")).toBeInTheDocument();
    expect(screen.getByText("활성 라이더")).toBeInTheDocument();
    expect(screen.getByText("3명")).toBeInTheDocument();
    expect(screen.getByText("오늘 현금 거래액")).toBeInTheDocument();
    expect(screen.getByText("31,950원")).toBeInTheDocument();
  });

  it("'오늘 발행 포인트' 카드가 없다(포인트 표기 0건)", () => {
    setup({
      orderCount: 0,
      collectedKg: 0,
      couponSalesAmount: 0,
      consumedCoupons: 0,
      activeRiderCount: 0,
      cashPaidAmount: 0,
    });
    expect(screen.queryByText("오늘 발행 포인트")).not.toBeInTheDocument();
    expect(screen.queryByText(/포인트/)).not.toBeInTheDocument();
  });
});

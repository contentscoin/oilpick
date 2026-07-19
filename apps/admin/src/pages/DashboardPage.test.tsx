import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import type { DashboardKpi } from "../hooks/useDashboard";

/**
 * DashboardPage KPI 카드 교체(07 F10-④) 렌더 검증:
 * - 08 KPI 6종: 오늘 주문/수거 kg/현금 지급/포인트 지급/출금 대기/활성 라이더
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
vi.mock("../lib/env", () => ({ MAP_STYLE_URL: undefined }));

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

describe("DashboardPage KPI (08 G7-②)", () => {
  it("08 KPI 6종을 렌더한다 — 현금/포인트 지급 분리 + 출금 대기 포함", () => {
    setup({
      orderCount: 4,
      collectedKg: 35.5,
      cashPaidAmount: 26450,
      pointPaidAmount: 9000,
      pendingWithdrawals: 2,
      activeRiderCount: 3,
    });

    expect(screen.getByText("오늘 주문 수")).toBeInTheDocument();
    expect(screen.getByText("4건")).toBeInTheDocument();
    expect(screen.getByText("오늘 수거 kg")).toBeInTheDocument();
    expect(screen.getByText("35.5kg")).toBeInTheDocument();
    expect(screen.getByText("오늘 현금 지급")).toBeInTheDocument();
    expect(screen.getByText("26,450원")).toBeInTheDocument();
    expect(screen.getByText("오늘 포인트 지급")).toBeInTheDocument();
    expect(screen.getByText("9,000P")).toBeInTheDocument();
    expect(screen.getByText("출금 대기")).toBeInTheDocument();
    expect(screen.getByText("2건")).toBeInTheDocument();
    expect(screen.getByText("활성 라이더")).toBeInTheDocument();
    expect(screen.getByText("3명")).toBeInTheDocument();
  });

  it("쿠폰 카드(판매액/소진)가 없다(08 P1 — 쿠폰 모델 폐기)", () => {
    setup({
      orderCount: 0,
      collectedKg: 0,
      cashPaidAmount: 0,
      pointPaidAmount: 0,
      pendingWithdrawals: 0,
      activeRiderCount: 0,
    });
    expect(screen.queryByText("오늘 쿠폰 판매액")).not.toBeInTheDocument();
    expect(screen.queryByText("오늘 소진 쿠폰")).not.toBeInTheDocument();
    expect(screen.queryByText(/쿠폰/)).not.toBeInTheDocument();
  });
});

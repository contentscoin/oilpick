import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PricePage } from "./PricePage";
import type { PriceTickRow } from "../hooks/usePriceAdmin";

/**
 * PricePage 08 G7-④ 검증:
 * - rider_fee 입력 필드 부재(구모델 UI 제거 — F3b-④에서 서버 계약 선삭제)
 * - price-set 페이로드에 riderFee 미포함(개정 zod 계약 준수)
 * - 쿠폰 단가 섹션 부재(08 P1 — 쿠폰 모델 폐기)
 * - 이력 테이블의 과거 rider_fee는 레거시 열로 유지(null="-")
 * - 06 E10-④: 정정 안내 배너(과거 tick 수정 금지 — 신규 tick 재등록 유도)
 */

const { mockInvoke, mockPriceHistory } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockPriceHistory: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/usePriceAdmin", () => ({
  usePriceHistory: () => mockPriceHistory(),
}));

// recharts ResponsiveContainer는 jsdom에서 크기 0으로 경고만 내므로 차트는 목킹한다.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  LineChart: () => <div data-testid="mock-line-chart" />,
  Line: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function setup({
  priceTicks = [],
}: {
  priceTicks?: PriceTickRow[];
} = {}) {
  mockPriceHistory.mockReturnValue({ data: priceTicks, isLoading: false, refetch: vi.fn() });
  return render(<PricePage />);
}

afterEach(() => {
  mockInvoke.mockReset();
  mockPriceHistory.mockReset();
});

describe("PricePage 시세 섹션 (rider_fee 제거)", () => {
  it("rider_fee 입력 필드가 없다 — 07 F10-①", () => {
    setup();
    expect(screen.queryByTestId("rider-fee-input")).not.toBeInTheDocument();
    expect(screen.queryByText("수거비 기본값(P)")).not.toBeInTheDocument();
  });

  it("시세 등록 시 pricePerKg만 담아 price-set을 호출한다(riderFee 미포함)", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    setup();
    fireEvent.change(screen.getByTestId("price-input"), { target: { value: "900" } });
    fireEvent.submit(screen.getByTestId("price-submit"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("price-set", { pricePerKg: 900 });
  });

  it("0 이하/비정수 매입가는 호출 없이 검증 에러를 낸다", async () => {
    setup();
    fireEvent.change(screen.getByTestId("price-input"), { target: { value: "-10" } });
    fireEvent.submit(screen.getByTestId("price-submit"));
    expect(await screen.findByText("매입가는 양의 정수로 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("이력 테이블의 레거시 rider_fee는 값이 있으면 표시, null이면 '-'", () => {
    setup({
      priceTicks: [
        { id: 2, pricePerKg: 900, riderFee: null, effectiveAt: "2026-07-09T00:00:00.000Z" },
        { id: 1, pricePerKg: 850, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00.000Z" },
      ],
    });
    const table = screen.getByTestId("price-history-table");
    expect(table).toHaveTextContent("수거비(레거시)");
    expect(table).toHaveTextContent("5,000원");
    expect(table).toHaveTextContent("-");
  });
});

describe("PricePage 쿠폰 단가 섹션 부재 (08 P1)", () => {
  it("쿠폰 단가 카드/폼/이력이 렌더되지 않는다", () => {
    setup();
    expect(screen.queryByTestId("coupon-price-current")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-price-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coupon-price-history-table")).not.toBeInTheDocument();
    expect(screen.queryByText(/쿠폰/)).not.toBeInTheDocument();
  });
});

describe("PricePage 정정 안내 배너 (06 E10-④)", () => {
  it("시세 섹션에 상시 배너를 렌더한다", () => {
    setup();
    expect(screen.getByTestId("tick-correction-notice-oil")).toBeInTheDocument();
    // 과거 tick 수정 금지(스냅샷 원칙) + 신규 tick 재등록 유도 문구.
    expect(screen.getAllByText(/과거 tick은 수정할 수 없어요/)).toHaveLength(1);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PricePage } from "./PricePage";
import type { CouponPriceTickRow, PriceTickRow } from "../hooks/usePriceAdmin";

/**
 * PricePage 08 G7-④ + [17 Q4] 검증:
 * - rider_fee 입력 필드 부재(구모델 UI 제거 — F3b-④에서 서버 계약 선삭제)
 * - price-set 페이로드에 riderFee 미포함(개정 zod 계약 준수)
 * - 쿠폰 단가 섹션 복원(17 Q4 — 08 P1 역전): coupon-price-set 호출·검증·미설정 안내·tick 이력
 * - 이력 테이블의 과거 rider_fee는 레거시 열로 유지(null="-")
 * - 06 E10-④: 정정 안내 배너(과거 tick 수정 금지 — 신규 tick 재등록 유도)
 */

const { mockInvoke, mockPriceHistory, mockFreshHistory, mockCouponHistory } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockPriceHistory: vi.fn(),
  mockFreshHistory: vi.fn(),
  mockCouponHistory: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/usePriceAdmin", () => ({
  usePriceHistory: () => mockPriceHistory(),
  useFreshOilPriceHistory: () => mockFreshHistory(),
  useCouponPriceHistory: () => mockCouponHistory(),
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
  couponTicks = [],
}: {
  priceTicks?: PriceTickRow[];
  couponTicks?: CouponPriceTickRow[];
} = {}) {
  mockPriceHistory.mockReturnValue({ data: priceTicks, isLoading: false, refetch: vi.fn() });
  // [14 J2] 신유 섹션 훅 기본값(빈 이력) — 기존 폐유 시세 테스트에는 영향 없다.
  mockFreshHistory.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  mockCouponHistory.mockReturnValue({ data: couponTicks, isLoading: false, isError: false, refetch: vi.fn() });
  return render(<PricePage />);
}

afterEach(() => {
  mockInvoke.mockReset();
  mockPriceHistory.mockReset();
  mockFreshHistory.mockReset();
  mockCouponHistory.mockReset();
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

describe("PricePage 쿠폰 단가 섹션 ([17 Q4] 복원 — 08 P1 역전)", () => {
  it("현재 단가 카드·폼·이력 테이블을 렌더한다(최신 tick = 현재 단가)", () => {
    setup({
      couponTicks: [
        { id: 2, unitPrice: 1200, effectiveAt: "2026-08-01T00:00:00.000Z" },
        { id: 1, unitPrice: 1000, effectiveAt: "2026-07-01T00:00:00.000Z" },
      ],
    });
    expect(screen.getByTestId("coupon-price-current")).toHaveTextContent("1,200원");
    const table = screen.getByTestId("coupon-price-history-table");
    expect(table).toHaveTextContent("1,200원");
    expect(table).toHaveTextContent("1,000원");
    expect(screen.queryByTestId("coupon-price-unset-notice")).not.toBeInTheDocument();
  });

  it("등록 시 unitPrice만 담아 coupon-price-set을 호출한다", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { id: 3, unitPrice: 1500, effectiveAt: "2026-08-05T00:00:00.000Z" },
    });
    setup();
    fireEvent.change(screen.getByTestId("coupon-price-input"), { target: { value: "1500" } });
    fireEvent.submit(screen.getByTestId("coupon-price-submit"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-price-set", { unitPrice: 1500 });
    expect(await screen.findByText("새 쿠폰 단가가 등록되었어요.")).toBeInTheDocument();
  });

  it("0 이하/비정수 단가는 호출 없이 검증 에러를 낸다(couponPriceSetInput 계약)", async () => {
    setup();
    fireEvent.change(screen.getByTestId("coupon-price-input"), { target: { value: "0" } });
    fireEvent.submit(screen.getByTestId("coupon-price-submit"));
    expect(await screen.findByText("쿠폰 단가는 양의 정수로 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("tick이 없으면 미설정 안내를 표시한다(초기 tick 필수 — DEPLOY 초기 데이터)", () => {
    setup({ couponTicks: [] });
    expect(screen.getByTestId("coupon-price-current")).toHaveTextContent("-");
    expect(screen.getByTestId("coupon-price-unset-notice")).toHaveTextContent("단가 미설정");
    expect(screen.getByTestId("coupon-price-history-table")).toHaveTextContent("등록된 쿠폰 단가가 없어요.");
  });

  it("서버 에러 응답이면 메시지를 표면화한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "권한이 없어요." });
    setup();
    fireEvent.change(screen.getByTestId("coupon-price-input"), { target: { value: "1500" } });
    fireEvent.submit(screen.getByTestId("coupon-price-submit"));
    expect(await screen.findByText("권한이 없어요.")).toBeInTheDocument();
  });
});

describe("PricePage 정정 안내 배너 (06 E10-④)", () => {
  it("시세·신유·쿠폰 단가 세 섹션에 상시 배너를 렌더한다", () => {
    setup();
    expect(screen.getByTestId("tick-correction-notice-oil")).toBeInTheDocument();
    expect(screen.getByTestId("tick-correction-notice-fresh")).toBeInTheDocument();
    // [17 Q4] 쿠폰 단가 섹션 복원으로 배너 3개.
    expect(screen.getByTestId("tick-correction-notice-coupon")).toBeInTheDocument();
    // 과거 tick 수정 금지(스냅샷 원칙) + 신규 tick 재등록 유도 문구(세 섹션).
    expect(screen.getAllByText(/과거 tick은 수정할 수 없어요/)).toHaveLength(3);
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

// jsdom(25)은 PointerEvent를 구현하지 않는다 — 스크럽(fireEvent.pointer*)용 최소 폴리필.
if (typeof window.PointerEvent === "undefined") {
  // @ts-expect-error 테스트 폴리필: MouseEvent가 clientX를 제공한다.
  window.PointerEvent = class extends MouseEvent {};
}

const {
  mockUseSession,
  mockUsePriceTicksSince,
  mockUseActiveOrder,
  mockUseOrderHistory,
  mockUseMonthlyCashReceipt,
  mockUseNotifications,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUsePriceTicksSince: vi.fn(),
  mockUseActiveOrder: vi.fn(),
  mockUseOrderHistory: vi.fn(),
  mockUseMonthlyCashReceipt: vi.fn(),
  mockUseNotifications: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/usePriceTicks", () => ({ usePriceTicksSince: mockUsePriceTicksSince }));
vi.mock("../hooks/useActiveOrder", () => ({ useActiveOrder: mockUseActiveOrder }));
vi.mock("../hooks/useOrderHistory", () => ({ useOrderHistory: mockUseOrderHistory }));
vi.mock("../hooks/useCashReceipts", () => ({ useMonthlyCashReceipt: mockUseMonthlyCashReceipt }));
vi.mock("../hooks/useNotifications", () => ({ useNotifications: mockUseNotifications }));

// 3일치 tick(상승) — resampleDaily로 3점 일별 시계열이 되어 차트가 렌더된다.
const RISING_TICKS = [
  { id: 1, pricePerKg: 700, riderFee: 0, effectiveAt: "2026-07-06T03:00:00Z" },
  { id: 2, pricePerKg: 710, riderFee: 0, effectiveAt: "2026-07-07T03:00:00Z" },
  { id: 3, pricePerKg: 730, riderFee: 0, effectiveAt: "2026-07-08T03:00:00Z" },
];

function stubRect(el: Element, width = 340) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: width, bottom: 180, width, height: 180, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUsePriceTicksSince.mockReturnValue({ data: RISING_TICKS, isLoading: false });
    mockUseActiveOrder.mockReturnValue({ data: null });
    mockUseOrderHistory.mockReturnValue({ data: { items: [], hasNextPage: false } });
    mockUseMonthlyCashReceipt.mockReturnValue({ data: { count: 2, cash: 48000 } });
    mockUseNotifications.mockReturnValue({ data: [] });
  });

  it("renders the daily price hero at the top with current price and chart", () => {
    renderHome();
    const hero = screen.getByTestId("price-hero");
    expect(hero).toBeInTheDocument();
    expect(within(hero).getByTestId("price-hero-label")).toHaveTextContent("오늘 매입가");
    expect(within(hero).getByTestId("hero-price")).toHaveTextContent("730");
    expect(within(hero).getByTestId("price-chart")).toBeInTheDocument();
  });

  it("replaces the hero number and label with the scrubbed day's value", () => {
    renderHome();
    const svg = screen.getByTestId("price-chart");
    stubRect(svg, 340);
    // clientX=0 → ratio 0 → 인덱스 0(2026-07-06, 700).
    fireEvent.pointerMove(svg, { clientX: 0 });
    expect(screen.getByTestId("hero-price")).toHaveTextContent("700");
    expect(screen.getByTestId("price-hero-label")).toHaveTextContent("7월 6일");
    // 스크럽 중에는 전일 대비 pill을 숨긴다.
    expect(screen.queryByTestId("hero-change-pill")).not.toBeInTheDocument();
    fireEvent.pointerLeave(svg);
    expect(screen.getByTestId("hero-price")).toHaveTextContent("730");
  });

  it("switches the chart period via the segment toggle", () => {
    renderHome();
    expect(screen.getByTestId("segment-option-30")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("segment-option-7"));
    expect(screen.getByTestId("segment-option-7")).toHaveAttribute("aria-checked", "true");
    expect(mockUsePriceTicksSince).toHaveBeenCalledWith(7);
  });

  it("shows the empty-state caption instead of a chart when fewer than 2 daily points", () => {
    mockUsePriceTicksSince.mockReturnValue({
      data: [{ id: 9, pricePerKg: 800, riderFee: 0, effectiveAt: "2026-07-08T03:00:00Z" }],
      isLoading: false,
    });
    renderHome();
    expect(screen.getByTestId("price-empty-caption")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
    // 현재가 자체는 계속 노출된다.
    expect(screen.getByTestId("hero-price")).toHaveTextContent("800");
  });

  it("shows a skeleton while the price is loading", () => {
    mockUsePriceTicksSince.mockReturnValue({ data: undefined, isLoading: true });
    renderHome();
    expect(screen.getByTestId("price-hero-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("hero-price")).not.toBeInTheDocument();
  });

  it("shows this month's cash receipt summary and links to the receipts screen", () => {
    renderHome();
    const summary = screen.getByTestId("cash-receipt-summary");
    expect(summary).toHaveTextContent("이번 달 수령");
    expect(summary).toHaveTextContent("48,000원");
  });

  it("no longer renders the QtyStepper / estimated-point section on the home screen", () => {
    renderHome();
    expect(screen.queryByTestId("qty-stepper-increment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("estimated-point")).not.toBeInTheDocument();
    expect(screen.queryByText("예상 지급 포인트")).not.toBeInTheDocument();
  });

  it("shows the pinned active order card when there is an in-progress order", () => {
    mockUseActiveOrder.mockReturnValue({
      data: { id: "order-1", status: "ACCEPTED", requestedKg: 30, snapshotPricePerKg: 700, createdAt: "2026-07-01T00:00:00Z" },
    });
    renderHome();
    expect(screen.getByTestId("active-order-card")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("라이더 배정");
  });

  it("renders up to 2 recent order rows", () => {
    mockUseOrderHistory.mockReturnValue({
      data: {
        items: [
          { id: "o1", status: "COMPLETED", requestedKg: 30, finalKg: 31.5, supplierPoint: null, createdAt: "2026-07-05T00:00:00Z" },
          { id: "o2", status: "COMPLETED", requestedKg: 15, finalKg: 15, supplierPoint: null, createdAt: "2026-07-04T00:00:00Z" },
          { id: "o3", status: "COMPLETED", requestedKg: 45, finalKg: 45, supplierPoint: null, createdAt: "2026-07-03T00:00:00Z" },
        ],
        hasNextPage: true,
      },
    });
    renderHome();
    expect(screen.getAllByTestId("recent-order-item")).toHaveLength(2);
  });
});

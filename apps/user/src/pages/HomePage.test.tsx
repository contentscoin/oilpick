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
  mockUseProfile,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUsePriceTicksSince: vi.fn(),
  mockUseActiveOrder: vi.fn(),
  mockUseOrderHistory: vi.fn(),
  mockUseMonthlyCashReceipt: vi.fn(),
  mockUseNotifications: vi.fn(),
  mockUseProfile: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/usePriceTicks", () => ({ usePriceTicksSince: mockUsePriceTicksSince }));
vi.mock("../hooks/useActiveOrder", () => ({ useActiveOrder: mockUseActiveOrder }));
vi.mock("../hooks/useOrderHistory", () => ({ useOrderHistory: mockUseOrderHistory }));
vi.mock("../hooks/useCashReceipts", () => ({ useMonthlyCashReceipt: mockUseMonthlyCashReceipt }));
vi.mock("../hooks/useNotifications", () => ({ useNotifications: mockUseNotifications }));
vi.mock("../hooks/useProfile", () => ({ useProfile: mockUseProfile }));

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
    mockUseProfile.mockReturnValue({ data: { id: "user-1", displayName: "김점주", storeName: "행복식당", address: "서울시 강서구" } });
  });

  it("[15] 헤더에 매장명을 제목으로 세운다", () => {
    renderHome();
    expect(screen.getByTestId("home-store-name")).toHaveTextContent("행복식당");
  });

  it("[15] 매장명을 아직 못 받았으면 로고만 렌더한다(빈 제목 금지)", () => {
    mockUseProfile.mockReturnValue({ data: undefined });
    renderHome();
    expect(screen.queryByTestId("home-store-name")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("payou-lockup").length).toBeGreaterThan(0);
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

  it("shows an error state (not the empty copy) with a retry button when the price query fails", () => {
    const refetch = vi.fn();
    mockUsePriceTicksSince.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderHome();
    const error = screen.getByTestId("query-error");
    expect(error).toHaveTextContent("시세를 불러오지 못했어요.");
    // 실패가 "아직 등록된 시세가 없어요"로 위장되지 않는다.
    expect(screen.queryByTestId("price-hero-nodata")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows skeleton cards (not the empty copy) while the recent order history is loading", () => {
    mockUseOrderHistory.mockReturnValue({ data: undefined, isLoading: true });
    renderHome();
    expect(screen.getByTestId("recent-orders-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("아직 수거 이력이 없어요.")).not.toBeInTheDocument();
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

  // useNotifications 모킹은 HomePage → useUnreadCount(실구현) → useNotifications로 이어지는
  // 경로에 그대로 적용된다(E7 공통 훅 추출 후에도 도트 렌더가 유지되는지 검증).
  it("shows the unread dot on the bell when there are unread notifications (E7)", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        { id: 1, title: "제목", body: "본문", link: null, readAt: null, createdAt: "2026-07-08T00:00:00Z" },
      ],
    });
    renderHome();
    expect(screen.getByTestId("notifications-unread-dot")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-link")).toHaveAttribute("aria-label", "알림 1건");
  });

  it("hides the unread dot when every notification is read (E7)", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        { id: 1, title: "제목", body: "본문", link: null, readAt: "2026-07-08T01:00:00Z", createdAt: "2026-07-08T00:00:00Z" },
      ],
    });
    renderHome();
    expect(screen.queryByTestId("notifications-unread-dot")).not.toBeInTheDocument();
    expect(screen.getByTestId("notifications-link")).toHaveAttribute("aria-label", "알림");
  });

  it("shows the pinned active order card when there is an in-progress order", () => {
    mockUseActiveOrder.mockReturnValue({
      data: { id: "order-1", status: "ACCEPTED", requestedKg: 30, snapshotPricePerKg: 700, createdAt: "2026-07-01T00:00:00Z" },
    });
    renderHome();
    expect(screen.getByTestId("active-order-card")).toBeInTheDocument();
    // [15] 상태는 DynamicIsland 하나로 축약한다(StatusBadge와 이중 표기하지 않는다).
    expect(screen.getByTestId("dynamic-island")).toHaveTextContent("라이더 배정");
  });

  it("announces the active order status politely so screen readers hear the change", () => {
    mockUseActiveOrder.mockReturnValue({
      data: { id: "order-1", status: "ARRIVED", requestedKg: 30, snapshotPricePerKg: 700, createdAt: "2026-07-01T00:00:00Z" },
    });
    renderHome();
    const island = screen.getByTestId("dynamic-island");
    expect(island).toHaveAttribute("aria-live", "polite");
    expect(island).toHaveTextContent("현장 도착");
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

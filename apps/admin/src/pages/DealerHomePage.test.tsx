import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealerHomePage } from "./DealerHomePage";

// 13 I4: 좌상 관할 대시보드 — 소속 라이더 목록·KPI·승인 액션.
const { mockUseMyRiders, mockUseMyRiderStats, mockVerifyRider, mockUnassign, mockUseDealerActiveOrders } = vi.hoisted(() => ({
  mockUseMyRiders: vi.fn(),
  mockUseMyRiderStats: vi.fn(),
  mockVerifyRider: vi.fn(),
  mockUnassign: vi.fn(),
  mockUseDealerActiveOrders: vi.fn(),
}));
vi.mock("../hooks/useDealerScope", () => ({
  useMyRiders: () => mockUseMyRiders(),
  useMyRiderStats: () => mockUseMyRiderStats(),
  useDealerActiveOrders: () => mockUseDealerActiveOrders(),
  useDealerScopeMutations: () => ({ verifyRider: mockVerifyRider, unassign: mockUnassign }),
}));

const RIDERS = [
  { id: "r1", name: "김라이더", phone: "010", verifyStatus: "PENDING", isOnline: false },
  { id: "r2", name: "이라이더", phone: "011", verifyStatus: "APPROVED", isOnline: true },
];
const STATS = [
  { rider_id: "r2", dealer_id: "d1", rider_name: "이라이더", verify_status: "APPROVED", is_online: true,
    completed_count: 3, collected_kg: 90, cash_paid: 60000, point_paid: 0, referral_signed_up: 1, referral_activated: 1 },
];

describe("DealerHomePage (13 I4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    mockVerifyRider.mockResolvedValue({ ok: true });
    mockUnassign.mockResolvedValue({ ok: true });
  });

  it("KPI 요약과 소속 라이더 목록을 렌더한다", () => {
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-kpi").textContent).toContain("2명"); // 소속 라이더
    const list = screen.getByTestId("dealer-rider-list");
    expect(list.textContent).toContain("김라이더");
    expect(list.textContent).toContain("이라이더");
  });

  it("PENDING 라이더에만 승인 버튼을 노출하고 클릭 시 승인한다", async () => {
    render(<DealerHomePage />);
    expect(screen.getByTestId("approve-r1")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-r2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("approve-r1"));
    await waitFor(() => expect(mockVerifyRider).toHaveBeenCalledWith("r1", "APPROVED"));
  });

  it("소속 해제 버튼이 dealer-assign(null)을 호출한다", async () => {
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("unassign-r2"));
    await waitFor(() => expect(mockUnassign).toHaveBeenCalledWith("r2"));
  });
});

describe("DealerHomePage — 진행중 운행 관제(16 L6)", () => {
  const BASE_ORDER = {
    orderId: "o1",
    status: "ARRIVED" as const,
    orderKind: null,
    riderId: "r2",
    riderName: "이라이더",
    pickupAddress: "서울 강서구 화곡로 1",
    purchaseRequestedCans: null,
    deliveredCans: null,
    acceptedAt: "2026-08-01T00:00:00Z",
    arrivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1시간 전 — 지연 아님
    createdAt: "2026-08-01T00:00:00Z",
  };

  it("진행중 주문을 상태 pill·라이더명과 함께 렌더하고, 현 소속 라이더면 전화 CTA를 단다", () => {
    mockUseDealerActiveOrders.mockReturnValue({ data: [BASE_ORDER] });
    render(<DealerHomePage />);
    const row = screen.getByTestId("dealer-active-o1");
    expect(row.textContent).toContain("현장 도착");
    expect(row.textContent).toContain("이라이더");
    expect(screen.getByTestId("dealer-active-call-o1")).toHaveAttribute("href", "tel:011");
    expect(screen.queryByTestId("dealer-active-stale-o1")).not.toBeInTheDocument();
  });

  it("ARRIVED 24시간 초과면 '확인 지연' 배지를 단다(admin 하이라이트와 동일 기준)", () => {
    mockUseDealerActiveOrders.mockReturnValue({
      data: [{ ...BASE_ORDER, arrivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }],
    });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-active-stale-o1")).toHaveTextContent("확인 지연");
  });

  it("전 소속(연락처 맵에 없는) 라이더는 전화 CTA를 렌더하지 않는다(PII 최소화)", () => {
    mockUseDealerActiveOrders.mockReturnValue({
      data: [{ ...BASE_ORDER, riderId: "r-gone", riderName: "라이더 r-gone" }],
    });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-active-o1")).toBeInTheDocument();
    expect(screen.queryByTestId("dealer-active-call-o1")).not.toBeInTheDocument();
  });

  it("진행중 운행이 없으면 빈 상태 문구 + 상태 변경 액션이 어디에도 없다(조회 전용, 13 D3)", () => {
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-active-empty")).toBeInTheDocument();
  });
});

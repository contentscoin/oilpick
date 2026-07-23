import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealerHomePage } from "./DealerHomePage";

// 13 I4: 좌상 관할 대시보드 — 소속 라이더 목록·KPI·승인 액션.
const { mockUseMyRiders, mockUseMyRiderStats, mockVerifyRider, mockUnassign } = vi.hoisted(() => ({
  mockUseMyRiders: vi.fn(),
  mockUseMyRiderStats: vi.fn(),
  mockVerifyRider: vi.fn(),
  mockUnassign: vi.fn(),
}));
vi.mock("../hooks/useDealerScope", () => ({
  useMyRiders: () => mockUseMyRiders(),
  useMyRiderStats: () => mockUseMyRiderStats(),
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

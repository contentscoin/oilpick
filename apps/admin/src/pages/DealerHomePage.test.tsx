import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealerHomePage } from "./DealerHomePage";

// 13 I4: 좌상 관할 대시보드 — 소속 라이더 목록·KPI·승인 액션.
const {
  mockUseMyRiders,
  mockUseMyRiderStats,
  mockVerifyRider,
  mockUnassign,
  mockSetRiderLimit,
  mockUseDealerActiveOrders,
  mockUseMyDealerAccount,
  mockUseDealerCompletedTotals,
} = vi.hoisted(() => ({
  mockUseMyRiders: vi.fn(),
  mockUseMyRiderStats: vi.fn(),
  mockVerifyRider: vi.fn(),
  mockUnassign: vi.fn(),
  mockSetRiderLimit: vi.fn(),
  mockUseDealerActiveOrders: vi.fn(),
  mockUseMyDealerAccount: vi.fn(),
  // [19 T10] 좌상 축 완료 총계 — KPI 건수·지급액의 진실(정산과 같은 축).
  mockUseDealerCompletedTotals: vi.fn(),
}));
vi.mock("../hooks/useDealerScope", () => ({
  useMyRiders: () => mockUseMyRiders(),
  useMyRiderStats: () => mockUseMyRiderStats(),
  useDealerActiveOrders: () => mockUseDealerActiveOrders(),
  useDealerCompletedTotals: () => mockUseDealerCompletedTotals(),
  // [18 R1·R5] 배분 모드/총 한도 — 크레딧 요약 배너·라이더별 배분 입력 노출을 가른다.
  useMyDealerAccount: () => mockUseMyDealerAccount(),
  useDealerScopeMutations: () => ({
    verifyRider: mockVerifyRider,
    unassign: mockUnassign,
    setRiderLimit: mockSetRiderLimit,
  }),
}));

// [18 R2] creditLimit/creditUsed는 DealerRiderRow 필수 필드(배분 입력·소진 표시).
const RIDERS = [
  { id: "r1", name: "김라이더", phone: "010", verifyStatus: "PENDING", isOnline: false, creditLimit: null, creditUsed: 0 },
  { id: "r2", name: "이라이더", phone: "011", verifyStatus: "APPROVED", isOnline: true, creditLimit: 50000, creditUsed: 12000 },
];
const STATS = [
  { rider_id: "r2", dealer_id: "d1", rider_name: "이라이더", verify_status: "APPROVED", is_online: true,
    completed_count: 3, collected_kg: 90, cash_paid: 60000, point_paid: 0, referral_signed_up: 1, referral_activated: 1,
    coupon_used_qty: 3 }, // [17 Q5] 완료 주문 coupon_cost 합
];

describe("DealerHomePage (13 I4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    // 좌상 축 총계 기본값 = 라이더 실적 합(STATS의 completed_count 3건)과 일치 → 고아분 0.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
    // [18 R1] 기본은 POOL(총량 공유) — 기존 단언들이 배분 입력 없이 그대로 통과한다.
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "POOL", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    mockVerifyRider.mockResolvedValue({ ok: true });
    mockUnassign.mockResolvedValue({ ok: true });
    mockSetRiderLimit.mockResolvedValue({ ok: true });
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

  // [17 Q5] 쿠폰 실적은 조회 전용 — 라이더 행 표기 + 정산 무관 카피(17 C5).
  it("라이더 행에 '쿠폰 사용 N장'을 표기한다 — 통계 없는 라이더는 0장, 정산 무관 카피 동반", () => {
    render(<DealerHomePage />);
    expect(screen.getByTestId("coupon-used-r2").textContent).toBe("쿠폰 사용 3장");
    expect(screen.getByTestId("coupon-used-r1").textContent).toBe("쿠폰 사용 0장"); // 통계 행 없음 → 0
    expect(screen.getByText(/정산과는 무관해요/)).toBeInTheDocument();
  });

  // [16 L9] 소속 해제는 파괴적 액션 — 확인 다이얼로그를 거쳐 dealer-assign(null)을 호출한다.
  it("소속 해제: 확인 다이얼로그 승인 후 dealer-assign(null)을 호출한다", async () => {
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("unassign-r2"));
    expect(mockUnassign).not.toHaveBeenCalled(); // 오탭 한 번으로는 실행되지 않는다
    expect(screen.getByTestId("rider-action-dialog")).toHaveTextContent("이라이더");
    fireEvent.click(screen.getByTestId("rider-action-confirm"));
    await waitFor(() => expect(mockUnassign).toHaveBeenCalledWith("r2"));
  });
});

describe("DealerHomePage — 4-decision 액션 완성(16 L9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    // 좌상 축 총계 기본값 = 라이더 실적 합(STATS의 completed_count 3건)과 일치 → 고아분 0.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
    // [18 R1] 기본은 POOL(총량 공유) — 기존 단언들이 배분 입력 없이 그대로 통과한다.
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "POOL", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    mockVerifyRider.mockResolvedValue({ ok: true });
    mockUnassign.mockResolvedValue({ ok: true });
    mockSetRiderLimit.mockResolvedValue({ ok: true });
  });

  it("PENDING: [반려]는 사유 없인 확정 불가, 사유 입력 후 REJECTED 호출", async () => {
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("reject-r1"));
    const confirm = screen.getByTestId("rider-action-confirm");
    expect(confirm).toBeDisabled(); // 사유 필수
    fireEvent.change(screen.getByTestId("rider-action-reason"), { target: { value: "사업자등록증 만료" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mockVerifyRider).toHaveBeenCalledWith("r1", "REJECTED", "사업자등록증 만료"));
  });

  it("APPROVED: [정지]는 입력한 사유로 SUSPENDED 호출('좌상 정지' 하드코딩 제거)", async () => {
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("suspend-r2"));
    fireEvent.change(screen.getByTestId("rider-action-reason"), { target: { value: "무단 미수거 반복" } });
    fireEvent.click(screen.getByTestId("rider-action-confirm"));
    await waitFor(() => expect(mockVerifyRider).toHaveBeenCalledWith("r2", "SUSPENDED", "무단 미수거 반복"));
  });

  it("SUSPENDED: [정지 해제]가 REINSTATED를 호출한다(예전엔 본사에 요청해야 했다)", async () => {
    mockUseMyRiders.mockReturnValue({
      data: [{ id: "r3", name: "박라이더", phone: "012", verifyStatus: "SUSPENDED", isOnline: false }],
      isLoading: false,
    });
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("reinstate-r3"));
    await waitFor(() => expect(mockVerifyRider).toHaveBeenCalledWith("r3", "REINSTATED"));
  });

  it("다이얼로그 [취소]는 아무 액션도 실행하지 않는다", () => {
    render(<DealerHomePage />);
    fireEvent.click(screen.getByTestId("suspend-r2"));
    fireEvent.click(screen.getByTestId("rider-action-cancel"));
    expect(screen.queryByTestId("rider-action-dialog")).not.toBeInTheDocument();
    expect(mockVerifyRider).not.toHaveBeenCalled();
  });
});

describe("DealerHomePage — 진행중 운행 관제(16 L6)", () => {
  // 첫 describe의 beforeEach는 그 스코프 전용 — 여기서도 기본 목을 다시 깐다.
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    // 좌상 축 총계 기본값 = 라이더 실적 합(STATS의 completed_count 3건)과 일치 → 고아분 0.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
    // [18 R1] 기본은 POOL(총량 공유) — 기존 단언들이 배분 입력 없이 그대로 통과한다.
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "POOL", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    mockVerifyRider.mockResolvedValue({ ok: true });
    mockUnassign.mockResolvedValue({ ok: true });
    mockSetRiderLimit.mockResolvedValue({ ok: true });
  });

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
    // 좌상 축 총계 기본값 = 라이더 실적 합(STATS의 completed_count 3건)과 일치 → 고아분 0.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-active-empty")).toBeInTheDocument();
  });
});

// [18 R1·R5] 크레딧 배분 — 모드별 요약 배너 + PER_RIDER에서만 라이더별 한도 입력.
describe("DealerHomePage — 크레딧 배분(18 R5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    // 좌상 축 총계 기본값 = 라이더 실적 합(STATS의 completed_count 3건)과 일치 → 고아분 0.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
    mockVerifyRider.mockResolvedValue({ ok: true });
    mockUnassign.mockResolvedValue({ ok: true });
    mockSetRiderLimit.mockResolvedValue({ ok: true });
  });

  it("POOL 모드: 총량 공유 안내만 뜨고 라이더별 배분 입력은 없다", () => {
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "POOL", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-credit-summary").textContent).toContain("총량 공유 중");
    expect(screen.queryByTestId("rider-limit-field-r2")).not.toBeInTheDocument();
  });

  it("PER_RIDER 모드: 배분 합계/총 한도를 보여주고 라이더별 입력으로 한도를 저장한다", async () => {
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "PER_RIDER", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    render(<DealerHomePage />);
    // 배분 합계 = r1(null→0) + r2(50,000). [19 T6]에서 숫자는 '크레딧 현황' 카드로 모았다
    // (dealer-credit-summary에는 모드별 행동 안내만 남는다 — 같은 값을 두 번 읽게 하지 않는다).
    expect(screen.getByTestId("dealer-alloc-summary").textContent).toContain("50,000P");
    fireEvent.change(screen.getByTestId("rider-limit-input-r2"), { target: { value: "70000" } });
    fireEvent.click(screen.getByTestId("rider-limit-save-r2"));
    await waitFor(() => expect(mockSetRiderLimit).toHaveBeenCalledWith("r2", 70000));
  });

  it("PER_RIDER 모드: 배분 합계가 총 한도를 넘으면 오버부킹 경고를 띄운다(저장 자체는 허용)", () => {
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "PER_RIDER", creditLimit: 10000, usage: 0, headroom: 10000 },
    });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-credit-summary").textContent).toContain("총 한도를 넘었어요");
  });

  it("PER_RIDER 모드: 입력을 비우면 배분 해제(null)로 저장한다", async () => {
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "PER_RIDER", creditLimit: 1000000, usage: 0, headroom: 1000000 },
    });
    render(<DealerHomePage />);
    fireEvent.change(screen.getByTestId("rider-limit-input-r2"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("rider-limit-save-r2"));
    await waitFor(() => expect(mockSetRiderLimit).toHaveBeenCalledWith("r2", null));
  });
});

// [19 T10] 좌상 데이터 ↔ 라이더 데이터 대사. 실적 목록은 "현 소속 라이더의 내 귀속분"이라
// 재배정된 라이더의 내 귀속분이 빠진다 — KPI는 좌상 축(정산과 같은 축)을 진실로 쓰고 차이를 설명한다.
describe("DealerHomePage — 좌상 축 대사(19 T10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyRiders.mockReturnValue({ data: RIDERS, isLoading: false });
    mockUseMyRiderStats.mockReturnValue({ data: STATS });
    mockUseDealerActiveOrders.mockReturnValue({ data: [] });
    mockUseMyDealerAccount.mockReturnValue({
      data: { allocationMode: "POOL", creditLimit: 1000000, usage: 12000, headroom: 988000 },
    });
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 3, netTotal: 60000 } });
  });

  it("KPI 건수·지급액은 좌상 축 총계를 쓴다(라이더 행 합계가 아니라)", () => {
    // 라이더 실적 합은 3건/60,000원인데 좌상 축은 5건/95,000원 — 좌상 축이 표시돼야 한다.
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 5, netTotal: 95000 } });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-kpi-completed").textContent).toContain("5건");
    expect(screen.getByTestId("dealer-kpi-paid").textContent).toContain("95,000");
  });

  it("두 축이 어긋나면 '전 소속 라이더 귀속분'으로 차이를 설명한다", () => {
    mockUseDealerCompletedTotals.mockReturnValue({ data: { orderCount: 5, netTotal: 95000 } });
    render(<DealerHomePage />);
    // 5건 − 라이더 실적 합 3건 = 2건
    expect(screen.getByTestId("dealer-kpi-completed").textContent).toContain("2건 포함");
    expect(screen.getByTestId("dealer-orphan-note")).toHaveTextContent("2건");
  });

  it("두 축이 일치하면 차이 안내를 띄우지 않는다", () => {
    render(<DealerHomePage />); // orderCount 3 === 라이더 실적 합 3
    expect(screen.queryByTestId("dealer-orphan-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("dealer-kpi-completed").textContent).not.toContain("포함");
  });

  it("좌상 축 총계 로딩 전에는 라이더 실적 합으로 폴백한다(빈 화면 방지)", () => {
    mockUseDealerCompletedTotals.mockReturnValue({ data: undefined });
    render(<DealerHomePage />);
    expect(screen.getByTestId("dealer-kpi-completed").textContent).toContain("3건");
    expect(screen.queryByTestId("dealer-orphan-note")).not.toBeInTheDocument();
  });
});

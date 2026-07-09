import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDetailPage } from "./OrderDetailPage";

const { mockUseOrder, mockUseAssignedRiderCard, mockInvokeEdgeFunction } = vi.hoisted(() => ({
  mockUseOrder: vi.fn(),
  mockUseAssignedRiderCard: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));

vi.mock("../hooks/useOrder", () => ({ useOrder: mockUseOrder }));
vi.mock("../hooks/useAssignedRiderCard", () => ({ useAssignedRiderCard: mockUseAssignedRiderCard }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

const BASE_ORDER = {
  id: "order-1",
  supplierId: "supplier-1",
  riderId: null as string | null,
  depotId: null,
  requestedCans: 1,
  requestedKg: 15,
  pickupAddress: "서울시 강서구",
  preferredTime: "지금",
  snapshotPricePerKg: 700,
  snapshotRiderFee: 5000,
  measuredKg: null as number | null,
  finalKg: null as number | null,
  supplierPoint: null as number | null,
  couponCost: 1 as number | null,
  cashPaidAmount: null as number | null,
  photoUrls: [] as string[],
  cancelReason: null as string | null,
  disputeReason: null as string | null,
  createdAt: "2026-07-01T00:00:00Z",
  acceptedAt: null as string | null,
  pickedUpAt: null as string | null,
  deliveredAt: null as string | null,
  completedAt: null as string | null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/orders/order-1"]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/" element={<div>HOME_PAGE</div>} />
        <Route path="/notifications" element={<div>NOTIFICATIONS_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAssignedRiderCard.mockReturnValue({ data: null });
  });

  it("shows the radius pulse and cancel button when REQUESTED", () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "REQUESTED" }, isLoading: false });
    renderPage();
    expect(screen.getByTestId("order-requested-panel")).toBeInTheDocument();
    expect(screen.getByTestId("radius-pulse")).toBeInTheDocument();
    expect(screen.getByTestId("order-cancel-button")).toBeInTheDocument();
  });

  it("confirms via dialog before calling order-transition CANCEL (E5)", async () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "REQUESTED" }, isLoading: false });
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { orderId: "order-1", status: "CANCELLED" } });
    renderPage();

    // 1단계: 취소 버튼은 곧바로 취소하지 않고 확인 시트를 연다.
    fireEvent.click(screen.getByTestId("order-cancel-button"));
    expect(mockInvokeEdgeFunction).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-sheet")).toBeInTheDocument();

    // 2단계: 확인 시트에서 확정해야 실제 CANCEL 전이가 호출된다.
    fireEvent.click(screen.getByTestId("confirm-sheet-confirm"));
    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-transition",
        expect.objectContaining({ orderId: "order-1", action: "CANCEL" }),
      ),
    );
  });

  it("renders the mockup header with title and notifications bell", () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "REQUESTED" }, isLoading: false });
    renderPage();
    expect(screen.getByRole("heading", { name: "수거 상세" })).toBeInTheDocument();
    expect(screen.getByTestId("order-detail-notifications")).toHaveAttribute("href", "/notifications");
  });

  it("shows the rider card, info stat card, and a single call CTA once a rider is assigned (ACCEPTED)", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ACCEPTED", riderId: "rider-1", requestedKg: 15, snapshotPricePerKg: 700 },
      isLoading: false,
    });
    mockUseAssignedRiderCard.mockReturnValue({
      data: { id: "rider-1", displayName: "박라이더", phone: "01011112222", vehicleNumber: "12가3456", verifyStatus: "APPROVED" },
    });
    renderPage();

    expect(screen.getByTestId("driver-card")).toHaveTextContent("박라이더");
    expect(screen.getByTestId("driver-card-verified")).toBeInTheDocument();
    expect(screen.getByTestId("driver-card-call")).toHaveAttribute("href", "tel:01011112222");

    // 상태 헤드라인: pill + 라이더명 보조문구.
    expect(screen.getByTestId("status-headline-pill")).toHaveTextContent("진행 중");
    expect(screen.getByText("박라이더 라이더가 매장으로 이동 중이에요")).toBeInTheDocument();

    // 정보 스탯 카드: 예상 수량 / 오늘 매입가 / 예상 수령액(15 * 700 = 10,500원).
    expect(screen.getByTestId("info-stat-card")).toBeInTheDocument();
    expect(screen.getByText("15.0kg")).toBeInTheDocument();
    expect(screen.getByText("700원/kg")).toBeInTheDocument();
    expect(screen.getByText("10,500원")).toBeInTheDocument();

    // 하단 단일 CTA: 라이더에게 전화(tel:).
    const cta = screen.getByTestId("order-call-rider");
    expect(cta).toHaveAttribute("href", "tel:01011112222");
    expect(cta).toHaveTextContent("라이더에게 전화");
  });

  it("does not show a cancel button for ACCEPTED orders (supplier cannot cancel after acceptance)", () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "ACCEPTED", riderId: "rider-1" }, isLoading: false });
    mockUseAssignedRiderCard.mockReturnValue({
      data: { id: "rider-1", displayName: "박라이더", phone: "01011112222", vehicleNumber: "12가3456", verifyStatus: "APPROVED" },
    });
    renderPage();
    expect(screen.queryByTestId("order-cancel-button")).not.toBeInTheDocument();
  });

  it("shows the measure confirmation UI with cash copy and confirm/dispute actions when ARRIVED with measuredKg", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1", measuredKg: 14.5, photoUrls: ["https://example.com/a.jpg"] },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("measure-confirm-panel")).toBeInTheDocument();
    expect(screen.getByTestId("measured-kg-value")).toHaveTextContent("14.5kg");
    // 14.5kg * 700원/kg = 10,150원
    expect(screen.getByTestId("measure-cash-amount")).toHaveTextContent("10,150원");
    // 07 F9-⑥: CONFIRM 버튼 = 무게+현금 2자 확인 카피.
    expect(screen.getByTestId("confirm-measure-button")).toHaveTextContent("무게 14.5kg 확인 · 현금 10,150원 받았습니다");
    expect(screen.getByTestId("open-dispute-form")).toBeInTheDocument();
    // 일반 계량(중재 전)은 중재 안내가 없다.
    expect(screen.queryByTestId("arbitration-notice")).not.toBeInTheDocument();
  });

  it("shows the post-arbitration confirmation (final_kg) without a dispute option when ARRIVED after RESOLVE_DISPUTE", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1", measuredKg: 14.5, finalKg: 13.0, photoUrls: ["https://example.com/a.jpg"] },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("measure-confirm-panel")).toBeInTheDocument();
    // 중재 확정 무게(final_kg=13.0)를 기준으로 현금 계산 = 13.0 * 700 = 9,100원.
    expect(screen.getByTestId("arbitration-notice")).toHaveTextContent("중재 확정 무게 13.0kg");
    expect(screen.getByTestId("measured-kg-value")).toHaveTextContent("13.0kg");
    expect(screen.getByTestId("measure-cash-amount")).toHaveTextContent("9,100원");
    expect(screen.getByTestId("confirm-measure-button")).toHaveTextContent("무게 13.0kg 확인 · 현금 9,100원 받았습니다");
    // 중재 완료 후에는 재이의신청 불가.
    expect(screen.queryByTestId("open-dispute-form")).not.toBeInTheDocument();
  });

  it("does not show the measure confirmation UI when ARRIVED without measuredKg yet", () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1" }, isLoading: false });
    renderPage();
    expect(screen.queryByTestId("measure-confirm-panel")).not.toBeInTheDocument();
  });

  it("calls order-transition CONFIRM_MEASURE when confirm is clicked", async () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1", measuredKg: 14.5, photoUrls: ["https://example.com/a.jpg"] },
      isLoading: false,
    });
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { orderId: "order-1", status: "PICKED_UP" } });
    renderPage();

    fireEvent.click(screen.getByTestId("confirm-measure-button"));
    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-transition",
        expect.objectContaining({ orderId: "order-1", action: "CONFIRM_MEASURE" }),
      ),
    );
  });

  it("submits a dispute with the entered reason", async () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1", measuredKg: 14.5, photoUrls: ["https://example.com/a.jpg"] },
      isLoading: false,
    });
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { orderId: "order-1", status: "DISPUTED" } });
    renderPage();

    fireEvent.click(screen.getByTestId("open-dispute-form"));
    fireEvent.change(screen.getByTestId("dispute-reason-input"), { target: { value: "계량이 다른 것 같아요" } });
    fireEvent.click(screen.getByTestId("submit-dispute-button"));

    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-transition",
        expect.objectContaining({ orderId: "order-1", action: "DISPUTE", payload: { reason: "계량이 다른 것 같아요" } }),
      ),
    );
  });

  it("shows the large received-cash hero when COMPLETED (new model)", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "COMPLETED", riderId: "rider-1", finalKg: 14.5, cashPaidAmount: 10150, completedAt: "2026-07-02T00:00:00Z" },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("completed-panel")).toBeInTheDocument();
    expect(screen.getByText("받은 현금")).toBeInTheDocument();
    expect(screen.getByTestId("completed-cash-amount")).toHaveTextContent("10,150원");
    // 신규 완료 주문에는 포인트 패널이 없다.
    expect(screen.queryByTestId("completed-legacy-panel")).not.toBeInTheDocument();
  });

  it("falls back to the legacy point hero for legacy completed orders (cash null, supplierPoint set)", () => {
    mockUseOrder.mockReturnValue({
      data: {
        ...BASE_ORDER,
        status: "COMPLETED",
        riderId: "rider-1",
        finalKg: 14.5,
        supplierPoint: 10150,
        cashPaidAmount: null,
        couponCost: null,
        pickedUpAt: "2026-07-01T00:10:00Z",
        deliveredAt: "2026-07-01T00:20:00Z",
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("completed-legacy-panel")).toBeInTheDocument();
    expect(screen.getByTestId("completed-supplier-point")).toHaveTextContent("10,150P");
    expect(screen.queryByTestId("completed-cash-amount")).not.toBeInTheDocument();
  });

  it("shows a not-found message when the order does not exist", () => {
    mockUseOrder.mockReturnValue({ data: null, isLoading: false });
    renderPage();
    expect(screen.getByText("주문을 찾을 수 없어요.")).toBeInTheDocument();
  });
});

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
  photoUrls: [] as string[],
  cancelReason: null as string | null,
  disputeReason: null as string | null,
  createdAt: "2026-07-01T00:00:00Z",
  acceptedAt: null as string | null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/orders/order-1"]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/" element={<div>HOME_PAGE</div>} />
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

  it("calls order-transition CANCEL when the cancel button is clicked", async () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "REQUESTED" }, isLoading: false });
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { orderId: "order-1", status: "CANCELLED" } });
    renderPage();

    fireEvent.click(screen.getByTestId("order-cancel-button"));
    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-transition",
        expect.objectContaining({ orderId: "order-1", action: "CANCEL" }),
      ),
    );
  });

  it("shows the rider card with a tel: link once a rider is assigned", () => {
    mockUseOrder.mockReturnValue({ data: { ...BASE_ORDER, status: "ACCEPTED", riderId: "rider-1" }, isLoading: false });
    mockUseAssignedRiderCard.mockReturnValue({
      data: { id: "rider-1", displayName: "박라이더", phone: "01011112222", vehicleNumber: "12가3456", verifyStatus: "APPROVED" },
    });
    renderPage();

    expect(screen.getByTestId("driver-card")).toHaveTextContent("박라이더");
    expect(screen.getByTestId("driver-card-verified")).toBeInTheDocument();
    expect(screen.getByTestId("driver-card-call")).toHaveAttribute("href", "tel:01011112222");
  });

  it("shows the measure confirmation UI with confirm/dispute actions when ARRIVED with measuredKg", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "ARRIVED", riderId: "rider-1", measuredKg: 14.5, photoUrls: ["https://example.com/a.jpg"] },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByTestId("measure-confirm-panel")).toBeInTheDocument();
    expect(screen.getByTestId("measured-kg-value")).toHaveTextContent("14.5kg");
    // 14.5kg * 700원/kg = 10,150P
    expect(screen.getByTestId("measure-estimated-point")).toHaveTextContent("10,150P");
    expect(screen.getByTestId("confirm-measure-button")).toBeInTheDocument();
    expect(screen.getByTestId("open-dispute-form")).toBeInTheDocument();
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

  it("shows the large supplier point display when COMPLETED", () => {
    mockUseOrder.mockReturnValue({
      data: { ...BASE_ORDER, status: "COMPLETED", riderId: "rider-1", finalKg: 14.5, supplierPoint: 10150 },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByTestId("completed-panel")).toBeInTheDocument();
    expect(screen.getByTestId("completed-supplier-point")).toHaveTextContent("10,150P");
  });

  it("shows a not-found message when the order does not exist", () => {
    mockUseOrder.mockReturnValue({ data: null, isLoading: false });
    renderPage();
    expect(screen.getByText("주문을 찾을 수 없어요.")).toBeInTheDocument();
  });
});

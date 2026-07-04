import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestPage } from "./RequestPage";

const { mockUseSession, mockUseProfile, mockUseLatestPriceTick, mockInvokeEdgeFunction } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseProfile: vi.fn(),
  mockUseLatestPriceTick: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useProfile", () => ({ useProfile: mockUseProfile }));
vi.mock("../hooks/usePriceTicks", () => ({ useLatestPriceTick: mockUseLatestPriceTick }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/request"]}>
        <Routes>
          <Route path="/request" element={<RequestPage />} />
          <Route path="/orders/:id" element={<div>ORDER_DETAIL_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function goToStep3(overrides?: { address?: string }) {
  fireEvent.click(screen.getByTestId("request-step-1-next"));
  fireEvent.change(screen.getByTestId("address-input"), {
    target: { value: overrides?.address ?? "서울시 강서구 오일픽로 1" },
  });
  fireEvent.click(screen.getByTestId("request-step-2-next"));
}

describe("RequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUseProfile.mockReturnValue({ data: { id: "user-1", displayName: "김사장", storeName: "행복식당", address: "" } });
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" } });
  });

  it("starts at step 1 with the qty stepper", () => {
    renderPage();
    expect(screen.getByTestId("request-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("qty-stepper")).toBeInTheDocument();
  });

  it("disables step 2's next button until an address is filled in", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    expect(screen.getByTestId("request-step-2-next")).toBeDisabled();
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구" } });
    expect(screen.getByTestId("request-step-2-next")).not.toBeDisabled();
  });

  it("shows the estimated point on step 3 (1 can = 15kg @ 700won/kg = 10,500P)", () => {
    renderPage();
    goToStep3();
    expect(screen.getByTestId("request-step-3")).toBeInTheDocument();
    expect(screen.getByTestId("request-estimated-point")).toHaveTextContent("10,500P");
  });

  it("calls order-create and navigates to the order detail page on success", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, snapshotRiderFee: 5000, estimatedPoint: 10500 },
    });
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByTestId("request-submit"));

    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-create",
        expect.objectContaining({ requestedKg: 15, address: "서울시 강서구 오일픽로 1", preferredTime: "지금" }),
      ),
    );
    expect(await screen.findByText("ORDER_DETAIL_PAGE")).toBeInTheDocument();
  });

  it("shows an error message and stays on step 3 when order-create fails", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({ ok: false, message: "진행 중인 주문이 너무 많아요. 완료 후 다시 요청해주세요." });
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByTestId("request-submit"));

    expect(await screen.findByTestId("request-error")).toHaveTextContent("진행 중인 주문이 너무 많아요");
    expect(screen.getByTestId("request-step-3")).toBeInTheDocument();
  });
});

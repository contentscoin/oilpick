import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestPage } from "./RequestPage";

const { mockUseSession, mockUseProfile, mockUseLatestPriceTick, mockUseRecentAddresses, mockInvokeEdgeFunction } =
  vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockUseProfile: vi.fn(),
    mockUseLatestPriceTick: vi.fn(),
    mockUseRecentAddresses: vi.fn(),
    mockInvokeEdgeFunction: vi.fn(),
  }));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useProfile", () => ({ useProfile: mockUseProfile }));
vi.mock("../hooks/usePriceTicks", () => ({ useLatestPriceTick: mockUseLatestPriceTick }));
vi.mock("../hooks/useRecentAddresses", () => ({ useRecentAddresses: mockUseRecentAddresses }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/request"]}>
        <Routes>
          <Route path="/request" element={<RequestPage />} />
          <Route path="/orders/:id" element={<div>ORDER_DETAIL_PAGE</div>} />
          <Route path="/" element={<div>HOME_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function goToStep3(overrides?: { address?: string }) {
  fireEvent.click(screen.getByTestId("request-step-1-next"));
  fireEvent.change(screen.getByTestId("address-input"), {
    target: { value: overrides?.address ?? "서울시 강서구 오반장로 1" },
  });
  fireEvent.click(screen.getByTestId("request-step-2-next"));
}

describe("RequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUseProfile.mockReturnValue({ data: { id: "user-1", displayName: "김사장", storeName: "행복식당", address: "" } });
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" } });
    mockUseRecentAddresses.mockReturnValue({ data: [] });
  });

  it("starts at step 1 with the step indicator, can-size preset, and qty stepper", () => {
    renderPage();
    expect(screen.getByTestId("request-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("can-size-preset")).toBeInTheDocument();
    expect(screen.getByTestId("qty-stepper")).toBeInTheDocument();
    // 1/2/3 도트 + 라벨 스텝 인디케이터.
    expect(screen.getByTestId("request-step-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("request-step-dot-1")).toBeInTheDocument();
    expect(screen.getByTestId("request-step-dot-3")).toBeInTheDocument();
    expect(screen.getByText("수량")).toBeInTheDocument();
    expect(screen.getByText("장소·시간")).toBeInTheDocument();
  });

  it("shows a sticky estimated-cash footer that updates live as the can count changes", () => {
    renderPage();
    // 1통 18L = 15kg × 700원/kg = 10,500원.
    expect(screen.getByTestId("request-estimate-cash")).toHaveTextContent("10,500원");
    // +1통 → 2통 = 30kg × 700 = 21,000원.
    fireEvent.click(screen.getByTestId("qty-stepper-increment"));
    expect(screen.getByTestId("request-estimate-cash")).toHaveTextContent("21,000원");
  });

  it("recomputes the estimate when the 10L can-size preset is selected (proportional kg)", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("can-size-10"));
    // 1통 10L = 8.3kg × 700 = 5,810원.
    expect(screen.getByTestId("request-estimate-cash")).toHaveTextContent("5,810원");
  });

  it("supports the 기타 preset with a direct kg input", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("can-size-etc"));
    expect(screen.queryByTestId("qty-stepper")).not.toBeInTheDocument();
    // step1 next is disabled until a valid kg is entered.
    expect(screen.getByTestId("request-step-1-next")).toBeDisabled();
    fireEvent.change(screen.getByTestId("custom-kg-input"), { target: { value: "40" } });
    // 40kg × 700 = 28,000원.
    expect(screen.getByTestId("request-estimate-cash")).toHaveTextContent("28,000원");
    expect(screen.getByTestId("request-step-1-next")).not.toBeDisabled();
  });

  it("prefills the address and coords when a recent-address chip is tapped", async () => {
    mockUseRecentAddresses.mockReturnValue({
      data: [{ address: "서울시 마포구 성미산로 1", lat: 37.55, lng: 126.9 }],
    });
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, couponCost: 1, estimatedCash: 10500 },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.click(screen.getByTestId("recent-address-chip-0"));
    // 칩 탭 → 주소 input에 프리필.
    expect(screen.getByTestId("address-input")).toHaveValue("서울시 마포구 성미산로 1");

    fireEvent.click(screen.getByTestId("request-step-2-next"));
    fireEvent.click(screen.getByTestId("request-submit"));
    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-create",
        expect.objectContaining({ address: "서울시 마포구 성미산로 1", lat: 37.55, lng: 126.9 }),
      ),
    );
  });

  it("resolves the '내일 오전' quick chip to a next-day 09:00 preferred time", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, couponCost: 1, estimatedCash: 10500 },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구 1" } });
    fireEvent.click(screen.getByTestId("preferred-time-tomorrowAM"));
    fireEvent.click(screen.getByTestId("request-step-2-next"));
    fireEvent.click(screen.getByTestId("request-submit"));

    await waitFor(() => expect(mockInvokeEdgeFunction).toHaveBeenCalled());
    const call = mockInvokeEdgeFunction.mock.calls[0]![1] as { preferredTime: string };
    expect(call.preferredTime).toMatch(/^\d{4}-\d{2}-\d{2} 09:00$/);
  });

  it("shows a success sheet with the estimated cash and navigates to the detail page on confirm", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, couponCost: 1, estimatedCash: 10500 },
    });
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByTestId("request-submit"));

    // 즉시 이동하지 않고 완료 시트를 띄운다.
    expect(await screen.findByTestId("confirm-sheet")).toBeInTheDocument();
    expect(screen.getByText(/요청이 접수됐어요/)).toBeInTheDocument();
    // 완료 시트 설명(예상 수령액)은 sticky 푸터 값과 텍스트가 겹치지 않게 "예상 수령액 …" 연속 문자열로 확인.
    expect(screen.getByText(/예상 수령액 10,500원/)).toBeInTheDocument();

    // [주문 상세 보기] → 상세 페이지 이동.
    fireEvent.click(screen.getByTestId("confirm-sheet-confirm"));
    expect(await screen.findByText("ORDER_DETAIL_PAGE")).toBeInTheDocument();
  });

  it("sends the correct requestedKg to order-create (1 can 18L = 15kg)", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, couponCost: 1, estimatedCash: 10500 },
    });
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByTestId("request-submit"));

    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-create",
        expect.objectContaining({ requestedKg: 15, requestedCans: 1, address: "서울시 강서구 오반장로 1", preferredTime: "지금" }),
      ),
    );
  });

  it("shows an error message and stays on step 3 when order-create fails", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({ ok: false, message: "진행 중인 주문이 너무 많아요. 완료 후 다시 요청해주세요." });
    renderPage();
    goToStep3();
    fireEvent.click(screen.getByTestId("request-submit"));

    expect(await screen.findByTestId("request-error")).toHaveTextContent("진행 중인 주문이 너무 많아요");
    expect(screen.getByTestId("request-step-3")).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-sheet")).not.toBeInTheDocument();
  });
});

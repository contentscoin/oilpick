import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestPage } from "./RequestPage";

const {
  mockUseSession,
  mockUseProfile,
  mockUseLatestPriceTick,
  mockUseFreshOilPrice,
  mockUseRecentAddresses,
  mockInvokeEdgeFunction,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseProfile: vi.fn(),
  mockUseLatestPriceTick: vi.fn(),
  mockUseFreshOilPrice: vi.fn(),
  mockUseRecentAddresses: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useProfile", () => ({ useProfile: mockUseProfile }));
vi.mock("../hooks/usePriceTicks", () => ({ useLatestPriceTick: mockUseLatestPriceTick }));
vi.mock("../hooks/useFreshOilPrice", () => ({ useFreshOilPrice: mockUseFreshOilPrice }));
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

/** 12 S2: 주소만으론 좌표가 미확정이라 step2 next가 잠긴다 — 수동 좌표 입력으로 확정한다. */
function fillAddressCoords(lat = "37.5", lng = "127") {
  fireEvent.click(screen.getByTestId("address-manual-coords-toggle"));
  fireEvent.change(screen.getByTestId("address-lat-input"), { target: { value: lat } });
  fireEvent.change(screen.getByTestId("address-lng-input"), { target: { value: lng } });
}

function goToStep3(overrides?: { address?: string }) {
  fireEvent.click(screen.getByTestId("request-step-1-next"));
  fireEvent.change(screen.getByTestId("address-input"), {
    target: { value: overrides?.address ?? "서울시 강서구 화곡로 1" },
  });
  fillAddressCoords();
  fireEvent.click(screen.getByTestId("request-step-2-next"));
}

describe("RequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUseProfile.mockReturnValue({ data: { id: "user-1", displayName: "김사장", storeName: "행복식당", address: "" } });
    mockUseLatestPriceTick.mockReturnValue({ data: { id: 1, pricePerKg: 700, riderFee: 5000, effectiveAt: "2026-07-01T00:00:00Z" } });
    // 기본은 신유 고시가 없음 → 구매 UI 숨김(순수 수거 기존 동작 유지). 구매 케이스는 개별 테스트에서 주입.
    mockUseFreshOilPrice.mockReturnValue({ data: undefined });
    mockUseRecentAddresses.mockReturnValue({ data: [] });
  });

  it("starts at step 1 with the step indicator and the 통(can) qty stepper only (no 통크기/kg toggle)", () => {
    renderPage();
    expect(screen.getByTestId("request-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("qty-stepper")).toBeInTheDocument();
    // [14 §6] 통 개수만 선택 — 통크기 프리셋과 kg 직접입력은 제거됐다.
    expect(screen.queryByTestId("can-size-preset")).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-kg-input")).not.toBeInTheDocument();
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

  // [N2] 퀵칩 4종 폐기 → datetime-local 상시 노출(기본값 = 현재 15분 올림) + [지금 바로] 1개.
  it("[N2] shows an always-visible datetime-local (15-min rounded default) and no quick chips", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));

    const input = screen.getByTestId("preferred-time-input") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(screen.getByText("희망 날짜·시간")).toBeInTheDocument();
    // 기본값: 'YYYY-MM-DDTHH:mm' + 분은 15의 배수(현재 시각 올림).
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(Number(input.value.slice(-2)) % 15).toBe(0);
    expect(new Date(input.value).getTime()).toBeGreaterThanOrEqual(Date.now() - 60 * 1000);

    // 퀵칩(지금/오늘 오후/내일 오전/직접)은 폐기됐다 — [지금 바로]만 남는다.
    expect(screen.queryByTestId("preferred-time-chips")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preferred-time-todayPM")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preferred-time-tomorrowAM")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preferred-time-custom-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("preferred-time-now")).toHaveTextContent("지금 바로");
  });

  it("[N2] rejects a past time (before now-30min): inline alert + step2 next locked", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구 1" } });
    fillAddressCoords();

    fireEvent.change(screen.getByTestId("preferred-time-input"), { target: { value: "2020-01-01T09:00" } });
    expect(screen.getByTestId("preferred-time-past-error")).toBeInTheDocument();
    expect(screen.getByTestId("request-step-2-next")).toBeDisabled();

    // [지금 바로] → 현재 시각으로 세팅되면 게이트가 풀린다.
    fireEvent.click(screen.getByTestId("preferred-time-now"));
    expect(screen.queryByTestId("preferred-time-past-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("request-step-2-next")).not.toBeDisabled();
  });

  it("[N2] requires a value: clearing the datetime locks step2 next", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구 1" } });
    fillAddressCoords();

    fireEvent.change(screen.getByTestId("preferred-time-input"), { target: { value: "" } });
    expect(screen.getByTestId("request-step-2-next")).toBeDisabled();
  });

  it("[N2] sends the picked datetime as 'YYYY-MM-DD HH:mm' (T→space) and shows it on the confirm step", async () => {
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, couponCost: 1, estimatedCash: 10500 },
    });
    renderPage();
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구 1" } });
    fillAddressCoords();
    fireEvent.change(screen.getByTestId("preferred-time-input"), { target: { value: "2030-05-01T14:30" } });
    fireEvent.click(screen.getByTestId("request-step-2-next"));

    // 확인 스텝 Row에 저장 포맷 그대로 노출.
    expect(screen.getByText("2030-05-01 14:30")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("request-submit"));
    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-create",
        expect.objectContaining({ preferredTime: "2030-05-01 14:30" }),
      ),
    );
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
        expect.objectContaining({
          requestedKg: 15,
          requestedCans: 1,
          address: "서울시 강서구 화곡로 1",
          // [N2] "지금" 리터럴 폐기 — 기본값(현재 15분 올림)도 항상 'YYYY-MM-DD HH:mm'.
          preferredTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
        }),
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

  it("[14 J2] shows the fresh-oil purchase section and nets it against the pickup, sending purchaseCans", async () => {
    mockUseFreshOilPrice.mockReturnValue({ data: { id: 1, pricePerCan: 26000, effectiveAt: "2026-07-01T00:00:00Z" } });
    mockInvokeEdgeFunction.mockResolvedValue({
      ok: true,
      data: { orderId: "order-1", snapshotPricePerKg: 700, estimatedCash: 10500 },
    });
    renderPage();

    // 신유 고시가가 있으면 구매 섹션이 노출된다.
    expect(screen.getByTestId("request-fresh-section")).toBeInTheDocument();

    // 신유 +1통(두 번째 스테퍼) → 폐유 1통(10,500원) − 신유 1통(26,000원) = −15,500원(결제액).
    fireEvent.click(screen.getAllByTestId("qty-stepper-increment")[1]!);
    expect(screen.getByTestId("request-estimate-cash")).toHaveTextContent("15,500원");

    // 스텝 진행 후 제출 → order-create에 purchaseCans 포함(requestedKg는 폐유 1통=15).
    fireEvent.click(screen.getByTestId("request-step-1-next"));
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구 1" } });
    fillAddressCoords();
    fireEvent.click(screen.getByTestId("request-step-2-next"));
    fireEvent.click(screen.getByTestId("request-submit"));

    await waitFor(() =>
      expect(mockInvokeEdgeFunction).toHaveBeenCalledWith(
        "order-create",
        expect.objectContaining({ purchaseCans: 1, requestedKg: 15 }),
      ),
    );
  });
});

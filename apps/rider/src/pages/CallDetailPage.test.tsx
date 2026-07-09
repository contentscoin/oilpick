import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSUFFICIENT_COUPON } from "@oilpick/core";
import { CallDetailPage } from "./CallDetailPage";

const { mockUseSession, mockUseOpenCalls, mockUseCouponBalance, mockInvoke } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOpenCalls: vi.fn(),
  mockUseCouponBalance: vi.fn(),
  mockInvoke: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useOpenCalls", () => ({ useOpenCalls: mockUseOpenCalls }));
vi.mock("../hooks/useCoupons", () => ({ useCouponBalance: mockUseCouponBalance }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    requestedKg: 45,
    pickupAddress: "서울시 강남구 테헤란로 123",
    pickupLat: 37.5,
    pickupLng: 127.0,
    snapshotPricePerKg: 1600,
    couponCost: 3,
    snapshotRiderFee: null,
    createdAt: "2026-07-09T00:00:00Z",
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/calls/o1"]}>
      <Routes>
        <Route path="/calls/:id" element={<CallDetailPage />} />
        <Route path="/coupons/purchase" element={<div>쿠폰 충전 화면</div>} />
        <Route path="/active" element={<div>운행 화면</div>} />
        <Route path="/" element={<div>콜 홈</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseOpenCalls.mockReturnValue({ data: [makeCall()], isLoading: false });
  mockUseCouponBalance.mockReturnValue({ data: 10 });
});

describe("CallDetailPage — 표기 전환(07 F5-④)", () => {
  it("shows 예상 매입 지급액(requestedKg×시세) + 쿠폰 N장 소진, 수거비 없음", () => {
    renderDetail();
    // 45kg × 1,600원 = 72,000원.
    expect(screen.getByTestId("call-detail-cash")).toHaveTextContent("72,000원");
    expect(screen.getByText("예상 매입 지급액")).toBeInTheDocument();
    expect(screen.getByTestId("call-detail-coupon")).toHaveTextContent("쿠폰 3장 소진");
    expect(screen.queryByText("수거비")).not.toBeInTheDocument();
  });

  it("omits coupon display for legacy orders (couponCost null)", () => {
    mockUseOpenCalls.mockReturnValue({ data: [makeCall({ couponCost: null })], isLoading: false });
    renderDetail();
    expect(screen.queryByTestId("call-detail-coupon")).not.toBeInTheDocument();
    // 매입액은 여전히 표시, 수락 게이트도 없음.
    expect(screen.getByTestId("call-detail-cash")).toBeInTheDocument();
    expect(screen.getByTestId("call-accept-button")).toBeInTheDocument();
  });
});

describe("CallDetailPage — 수락 게이트(07 F5-⑤)", () => {
  it("fail-fast: 잔액<coupon_cost면 [충전하러 가기] CTA, 수락 버튼 없음", () => {
    mockUseCouponBalance.mockReturnValue({ data: 1 });
    renderDetail();
    expect(screen.getByTestId("call-accept-gate")).toHaveTextContent("보유 1장");
    expect(screen.getByTestId("call-accept-gate")).toHaveTextContent("필요 3장");
    expect(screen.queryByTestId("call-accept-button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-charge-cta"));
    expect(screen.getByText("쿠폰 충전 화면")).toBeInTheDocument();
  });

  it("409 INSUFFICIENT_COUPON: 토스트 + [충전하러 가기] CTA(목록으로 튕기지 않음)", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      code: INSUFFICIENT_COUPON,
      message: "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요.",
    });
    renderDetail();
    // 사전 잔액(10)은 충분 → 수락 버튼이 보인다.
    fireEvent.click(screen.getByTestId("call-accept-button"));
    await waitFor(() => expect(screen.getByTestId("call-charge-cta")).toBeInTheDocument());
    expect(screen.getByTestId("toast")).toHaveTextContent("수거쿠폰이 부족해요. 충전 후 수락할 수 있어요.");
  });

  it("성공 시 운행 화면으로 이동", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { orderId: "o1", status: "ACCEPTED" } });
    renderDetail();
    fireEvent.click(screen.getByTestId("call-accept-button"));
    await waitFor(() => expect(screen.getByText("운행 화면")).toBeInTheDocument());
  });
});

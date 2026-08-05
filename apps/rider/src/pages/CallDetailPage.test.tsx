import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@oilpick/ui";
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
// [16 L3 §3-1] 위치·도로 경로는 부가 기능 — 기본은 "없음"(칩 미표기 폴백 경로).
const { mockUseGeolocation, mockUseDirections } = vi.hoisted(() => ({
  mockUseGeolocation: vi.fn(() => null as { lat: number; lng: number } | null),
  mockUseDirections: vi.fn(() => ({ data: undefined as unknown })),
}));
vi.mock("../hooks/useGeolocation", () => ({ useGeolocation: mockUseGeolocation }));
vi.mock("../hooks/useDirections", () => ({ useDirections: mockUseDirections }));

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    requestedKg: 45,
    pickupAddress: "서울시 강남구 테헤란로 123",
    pickupLat: 37.5,
    pickupLng: 127.0,
    snapshotPricePerKg: 1600,
    snapshotRiderFee: null,
    // [17 Q3] 쿠폰 복권 기본 픽스처: 45kg → ceil(45/15)=3장(17 C1). 전환기 케이스는 null override.
    couponCost: 3,
    preferredTime: "2026-08-06 09:30",
    createdAt: "2026-07-09T00:00:00Z",
    ...overrides,
  };
}

function renderDetail() {
  // 페이지가 useToast를 쓰므로 실제 앱(App.tsx)과 동일하게 ToastProvider로 감싼다(E6).
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/calls/o1"]}>
        <Routes>
          <Route path="/calls/:id" element={<CallDetailPage />} />
          <Route path="/active" element={<div>운행 화면</div>} />
          <Route path="/coupons/purchase" element={<div>충전 화면</div>} />
          <Route path="/" element={<div>콜 홈</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseOpenCalls.mockReturnValue({ data: [makeCall()], isLoading: false });
  // [17 Q3] 기본은 잔액 충분(coupon_cost 3 대비 5장) — 게이트 케이스에서 개별 override.
  mockUseCouponBalance.mockReturnValue({ data: 5 });
  // clearAllMocks는 mockReturnValue를 지우지 않는다 — 테스트 간 누수 방지로 매번 초기화.
  mockUseGeolocation.mockReturnValue(null);
  mockUseDirections.mockReturnValue({ data: undefined });
});

describe("CallDetailPage — 도로 기준 거리·소요 칩(16 L3 §3-1)", () => {
  it("directions가 활성(configured)이면 도로 km·소요를 표기한다", () => {
    mockUseGeolocation.mockReturnValue({ lat: 37.5, lng: 127.0 });
    mockUseDirections.mockReturnValue({
      data: { configured: true, distanceMeters: 5230, durationSeconds: 1080, path: [{ lat: 37.5, lng: 127.0 }] },
    });
    renderDetail();
    expect(screen.getByTestId("call-detail-road")).toHaveTextContent("5.2km");
    expect(screen.getByTestId("call-detail-road")).toHaveTextContent("18분");
  });

  it("위치 권한 거부·키 미설정(configured:false)이면 칩 자체가 없다(폴백)", () => {
    mockUseDirections.mockReturnValue({
      data: { configured: false, distanceMeters: null, durationSeconds: null, path: [] },
    });
    renderDetail();
    expect(screen.queryByTestId("call-detail-road")).not.toBeInTheDocument();
  });
});

describe("CallDetailPage — 표기(08 G6-② + 17 Q3 쿠폰 병기)", () => {
  it("shows 예상 매입 지급액(requestedKg×시세) + 소진 쿠폰 행, 수거비 표기 없음", () => {
    renderDetail();
    // 45kg × 1,600원 = 72,000원 — 지급 표기는 08 불변(17 C7).
    expect(screen.getByTestId("call-detail-cash")).toHaveTextContent("72,000원");
    expect(screen.getByText("예상 매입 지급액")).toBeInTheDocument();
    // [17 Q3] 소진 쿠폰(coupon_cost) 병기.
    expect(screen.getByTestId("call-detail-coupon")).toHaveTextContent("쿠폰 3장 소진");
    expect(screen.queryByText("수거비")).not.toBeInTheDocument();
  });

  it("[17 Q3] 전환기 무쿠폰 주문(coupon_cost null)은 쿠폰 행이 없다", () => {
    mockUseOpenCalls.mockReturnValue({ data: [makeCall({ couponCost: null })], isLoading: false });
    renderDetail();
    expect(screen.queryByTestId("call-detail-coupon")).not.toBeInTheDocument();
    expect(screen.queryByText(/쿠폰/)).not.toBeInTheDocument();
  });

  it("잔액이 충분하면 게이트 없이 수락 버튼이 바로 보인다", () => {
    renderDetail();
    expect(screen.queryByTestId("call-accept-gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("call-accept-button")).toBeInTheDocument();
  });

  // [N5] 점주 희망 시간 행 — 저장 문자열 그대로, 값 없으면 행 미렌더.
  it("[N5] 희망 시간 정보 행을 저장 문자열 그대로 표시한다", () => {
    renderDetail();
    const row = screen.getByTestId("call-detail-preferred");
    expect(row).toHaveTextContent("희망 시간");
    expect(row).toHaveTextContent("2026-08-06 09:30");
  });

  it("[N5] preferredTime이 없으면(null) 희망 시간 행이 없다", () => {
    mockUseOpenCalls.mockReturnValue({ data: [makeCall({ preferredTime: null })], isLoading: false });
    renderDetail();
    expect(screen.queryByTestId("call-detail-preferred")).not.toBeInTheDocument();
  });
});

describe("CallDetailPage — 수락 게이트(17 Q3, 07 F5-⑤ 복권)", () => {
  it("잔액 < coupon_cost면 사전 fail-fast: 수락 버튼 대신 부족 안내 + [충전하러 가기]", () => {
    mockUseCouponBalance.mockReturnValue({ data: 1 });
    renderDetail();
    const gate = screen.getByTestId("call-accept-gate");
    expect(gate).toHaveTextContent("수거쿠폰이 부족해요 (보유 1장 / 필요 3장)");
    expect(screen.queryByTestId("call-accept-button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-charge-cta"));
    expect(screen.getByText("충전 화면")).toBeInTheDocument();
  });

  it("전환기 무쿠폰 주문(coupon_cost null)은 잔액 0이어도 게이트 없이 수락 버튼", () => {
    mockUseCouponBalance.mockReturnValue({ data: 0 });
    mockUseOpenCalls.mockReturnValue({ data: [makeCall({ couponCost: null })], isLoading: false });
    renderDetail();
    expect(screen.queryByTestId("call-accept-gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("call-accept-button")).toBeInTheDocument();
  });

  it("409 INSUFFICIENT_COUPON(사전 체크 통과 후 경합): 토스트 + 머무르며 [충전하러 가기] CTA", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      code: INSUFFICIENT_COUPON,
      message: "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요.",
    });
    renderDetail();
    fireEvent.click(screen.getByTestId("call-accept-button"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("수거쿠폰이 부족해요"),
    );
    // 목록으로 튕기지 않고 이 화면에서 충전 CTA를 노출한다.
    expect(screen.getByTestId("call-accept-gate")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-charge-cta"));
    expect(screen.getByText("충전 화면")).toBeInTheDocument();
  });

  it("성공 시 '콜을 수락했어요' 토스트 + 운행 화면으로 이동(06 E6)", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { orderId: "o1", status: "ACCEPTED" } });
    renderDetail();
    fireEvent.click(screen.getByTestId("call-accept-button"));
    await waitFor(() => expect(screen.getByText("운행 화면")).toBeInTheDocument());
    expect(screen.getByTestId("toast")).toHaveTextContent("콜을 수락했어요");
  });
});

describe("CallDetailPage — not-found 탈출(07 F6-⑦/E2)", () => {
  it("캐시에 없는 콜(만료/수락됨) 진입 시 ErrorScreen + [콜 목록으로]", () => {
    mockUseOpenCalls.mockReturnValue({ data: [], isLoading: false });
    renderDetail();
    expect(screen.getByTestId("error-screen")).toBeInTheDocument();
    expect(screen.getByText("콜을 찾을 수 없어요")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-detail-back-to-list"));
    expect(screen.getByText("콜 홈")).toBeInTheDocument();
  });
});

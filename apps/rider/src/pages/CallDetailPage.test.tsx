import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSUFFICIENT_COUPON } from "@oilpick/core";
import { CallDetailPage } from "./CallDetailPage";

const { mockUseSession, mockUseOpenCalls, mockInvoke } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOpenCalls: vi.fn(),
  mockInvoke: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useOpenCalls", () => ({ useOpenCalls: mockUseOpenCalls }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    requestedKg: 45,
    pickupAddress: "서울시 강남구 테헤란로 123",
    pickupLat: 37.5,
    pickupLng: 127.0,
    snapshotPricePerKg: 1600,
    snapshotRiderFee: null,
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
});

describe("CallDetailPage — 표기(08 G6-②)", () => {
  it("shows 예상 매입 지급액(requestedKg×시세), 쿠폰·수거비 표기 없음", () => {
    renderDetail();
    // 45kg × 1,600원 = 72,000원.
    expect(screen.getByTestId("call-detail-cash")).toHaveTextContent("72,000원");
    expect(screen.getByText("예상 매입 지급액")).toBeInTheDocument();
    expect(screen.queryByTestId("call-detail-coupon")).not.toBeInTheDocument();
    expect(screen.queryByText(/쿠폰/)).not.toBeInTheDocument();
    expect(screen.queryByText("수거비")).not.toBeInTheDocument();
  });

  it("수락 게이트(쿠폰 잔액 체크) 없이 수락 버튼이 바로 보인다", () => {
    renderDetail();
    expect(screen.queryByTestId("call-accept-gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("call-accept-button")).toBeInTheDocument();
  });
});

describe("CallDetailPage — 수락 에러(전환기 레거시)", () => {
  it("409 INSUFFICIENT_COUPON(잔존 쿠폰 주문): 한국어 토스트, 충전 CTA 없음", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      code: INSUFFICIENT_COUPON,
      message: "이 주문은 이전 방식(수거쿠폰) 주문이라 지금은 수락할 수 없어요.",
    });
    renderDetail();
    fireEvent.click(screen.getByTestId("call-accept-button"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("이전 방식(수거쿠폰) 주문"),
    );
    expect(screen.queryByTestId("call-charge-cta")).not.toBeInTheDocument();
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

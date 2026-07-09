import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@oilpick/core";
import { ActiveRunPage } from "./ActiveRunPage";
import type { ActiveRun } from "../hooks/useActiveRun";

const { mockUseSession, mockUseActiveRun } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseActiveRun: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useActiveRun", () => ({ useActiveRun: mockUseActiveRun }));
vi.mock("../hooks/useRiderLocationPusher", () => ({ useRiderLocationPusher: vi.fn() }));
vi.mock("../lib/native/scanner", () => ({ isScannerAvailable: () => false, scanQrCode: vi.fn() }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("../lib/env", () => ({ KAKAO_KEY: "test-key" }));

function makeRun(overrides: Partial<ActiveRun> = {}): ActiveRun {
  return {
    id: "o1",
    status: "ARRIVED" as OrderStatus,
    supplierId: "s1",
    depotId: null,
    pickupAddress: "서울시 강남구 테헤란로 123",
    requestedKg: 45,
    measuredKg: null,
    finalKg: null,
    photoUrls: [],
    snapshotPricePerKg: 1600,
    snapshotRiderFee: 0,
    couponCost: 3,
    cashPaidAmount: null,
    completedAt: null,
    createdAt: "2026-07-09T00:00:00Z",
    ...overrides,
  };
}

function renderRun(run: ActiveRun | null) {
  mockUseActiveRun.mockReturnValue({ data: run, isLoading: false });
  return render(
    <MemoryRouter initialEntries={["/active"]}>
      <Routes>
        <Route path="/active" element={<ActiveRunPage />} />
        <Route path="/" element={<div>콜 홈</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
});

describe("ActiveRunPage — ARRIVED 현금 매입(07 F6-①)", () => {
  it("제출 전: 현금 매입 폼 + kg 입력 시 '점주에게 지급할 현금'(원화)", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: null, finalKg: null }));
    expect(screen.getByTestId("run-arrived-panel")).toBeInTheDocument();
    expect(screen.getByTestId("submit-measure-button")).toHaveTextContent("계량 제출 → 사장님 확인 요청");
    // 예전 포인트 배너는 없다.
    expect(screen.queryByTestId("run-estimated-point")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    // 40kg × 1,600원 = 64,000원.
    expect(screen.getByTestId("run-cash-payout")).toHaveTextContent("점주에게 지급할 현금");
    expect(screen.getByTestId("run-cash-payout")).toHaveTextContent("64,000원");
  });

  it("제출 후(measuredKg 존재): '현금 지급 후 사장님 확인' 대기 배너", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, finalKg: null }));
    const banner = screen.getByTestId("measure-wait-banner");
    expect(banner).toHaveTextContent("사장님 확인 대기");
    expect(banner).toHaveTextContent("40.0kg");
    expect(banner).toHaveTextContent("64,000원");
    expect(screen.queryByTestId("run-arrived-panel")).not.toBeInTheDocument();
  });

  it("중재 완료(finalKg 존재): 재제출 불가 — 확정 무게 + 지급 현금 안내(폼 숨김)", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, finalKg: 42 }));
    const panel = screen.getByTestId("run-arbitration-complete");
    expect(panel).toHaveTextContent("중재 확정 무게 42.0kg");
    // 42kg × 1,600원 = 67,200원.
    expect(panel).toHaveTextContent("67,200원");
    expect(screen.queryByTestId("run-arrived-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("measure-wait-banner")).not.toBeInTheDocument();
  });
});

describe("ActiveRunPage — DISPUTED 안내(07 F6-③)", () => {
  it("분쟁 패널 + 제출 kg/사진 요약", () => {
    renderRun(makeRun({ status: "DISPUTED", measuredKg: 40, photoUrls: ["a.jpg", "b.jpg"] }));
    const panel = screen.getByTestId("run-disputed-panel");
    expect(panel).toHaveTextContent("사장님이 계량에 이의신청했어요");
    expect(panel).toHaveTextContent("40.0kg");
    expect(panel).toHaveTextContent("2장");
  });
});

describe("ActiveRunPage — COMPLETED 요약(07 F6-④)", () => {
  it("'수거 완료 — 현금 ₩N 지급' + 콜 홈으로", () => {
    renderRun(makeRun({ status: "COMPLETED", finalKg: 40, cashPaidAmount: 64000, completedAt: "2026-07-09T00:00:00Z" }));
    const panel = screen.getByTestId("run-completed-panel");
    expect(panel).toHaveTextContent("수거 완료");
    expect(panel).toHaveTextContent("64,000원");
    fireEvent.click(screen.getByTestId("completed-go-home"));
    expect(screen.getByText("콜 홈")).toBeInTheDocument();
  });
});

describe("ActiveRunPage — 레거시 PICKED_UP(07 F6-②)", () => {
  it("QR 배송 경로(폴백 입력 + 배송완료)가 잔존한다", () => {
    renderRun(makeRun({ status: "PICKED_UP", depotId: "depot-1" }));
    expect(screen.getByTestId("run-picked-up-panel")).toBeInTheDocument();
    expect(screen.getByTestId("depot-id-input")).toBeInTheDocument();
    expect(screen.getByTestId("qr-secret-input")).toBeInTheDocument();
    expect(screen.getByTestId("deliver-button")).toBeInTheDocument();
  });
});

describe("ActiveRunPage — 활성 주문 없음", () => {
  it("EmptyState + 콜 홈으로", () => {
    renderRun(null);
    expect(screen.getByTestId("active-run-go-home")).toBeInTheDocument();
  });
});

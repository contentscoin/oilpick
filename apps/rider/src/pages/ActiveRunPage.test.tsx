import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@oilpick/core";
import { ActiveRunPage } from "./ActiveRunPage";
import type { ActiveRun } from "../hooks/useActiveRun";

const { mockUseSession, mockUseActiveRun, mockInvoke, mockStorageFrom } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseActiveRun: vi.fn(),
  mockInvoke: vi.fn(),
  mockStorageFrom: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useActiveRun", () => ({ useActiveRun: mockUseActiveRun }));
vi.mock("../hooks/useRiderLocationPusher", () => ({ useRiderLocationPusher: vi.fn() }));
vi.mock("../lib/native/scanner", () => ({ isScannerAvailable: () => false, scanQrCode: vi.fn() }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { storage: { from: mockStorageFrom } } }));
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
    payoutMethod: null,
    cashPaidAmount: null,
    completedAt: null,
    createdAt: "2026-07-09T00:00:00Z",
    supplierPhone: null,
    supplierName: null,
    ...overrides,
  };
}

function renderRun(run: ActiveRun | null) {
  mockUseActiveRun.mockReturnValue({ data: run, isLoading: false });
  // 패널들이 useToast를 쓰므로 실제 앱(App.tsx)과 동일하게 ToastProvider로 감싼다(E6).
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/active"]}>
        <Routes>
          <Route path="/active" element={<ActiveRunPage />} />
          <Route path="/" element={<div>콜 홈</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  // jsdom에는 URL.createObjectURL이 없다 — PhotoUploader 미리보기용 스텁.
  URL.createObjectURL = vi.fn((file: File | Blob) => `blob:${file instanceof File ? file.name : "blob"}`);
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

  it("현금 지급 분쟁 CS 진입점: CASH_DISPUTE + orderId 프리셋으로 이동(07 F12 ③)", () => {
    renderRun(makeRun({ id: "o-42", status: "DISPUTED", measuredKg: 40 }));
    const entry = screen.getByTestId("disputed-cs-entry");
    expect(entry).toHaveTextContent("현금 지급 문제로 문의하기");
    // /support?category=CASH_DISPUTE&orderId=o-42 로 navigate (라우트가 없으면 화면 전환만 확인).
    fireEvent.click(entry);
    expect(screen.queryByTestId("run-disputed-panel")).not.toBeInTheDocument();
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

describe("ActiveRunPage — 액션 피드백 토스트(06 E6)", () => {
  it("도착(ARRIVE) 성공: '도착을 알렸어요' 토스트", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderRun(makeRun({ status: "ACCEPTED" }));
    fireEvent.click(screen.getByTestId("arrive-button"));
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("도착을 알렸어요"));
  });

  it("도착(ARRIVE) 실패: 에러 토스트", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "전이할 수 없는 상태예요." });
    renderRun(makeRun({ status: "ACCEPTED" }));
    fireEvent.click(screen.getByTestId("arrive-button"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("전이할 수 없는 상태예요."),
    );
  });
});

describe("ActiveRunPage — 계량 제출: 업로드 진행 + 토스트(06 E6/E8-③)", () => {
  function fillMeasureForm() {
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    // 08 P2: 지급 수단 필수 — 현금 선택.
    fireEvent.click(screen.getByTestId("payout-option-cash"));
    const files = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ];
    fireEvent.change(screen.getByTestId("photo-uploader-input"), { target: { files } });
  }

  it("순차 업로드 중 '사진 N/M 업로드 중' 표시 후 성공 토스트", async () => {
    // 업로드 promise를 수동 resolve해 진행 카운트 전환을 관찰한다.
    const resolvers: Array<() => void> = [];
    mockStorageFrom.mockReturnValue({
      upload: vi.fn(
        () => new Promise<{ error: null }>((res) => resolvers.push(() => res({ error: null }))),
      ),
      createSignedUrl: vi.fn(() =>
        Promise.resolve({ data: { signedUrl: "https://signed.example/p.jpg" }, error: null }),
      ),
    });
    mockInvoke.mockResolvedValue({ ok: true, data: {} });

    renderRun(makeRun({ status: "ARRIVED" }));
    fillMeasureForm();
    fireEvent.click(screen.getByTestId("submit-measure-button"));

    await waitFor(() =>
      expect(screen.getByTestId("upload-progress")).toHaveTextContent("사진 1/2 업로드 중"),
    );
    resolvers[0]?.();
    await waitFor(() =>
      expect(screen.getByTestId("upload-progress")).toHaveTextContent("사진 2/2 업로드 중"),
    );
    resolvers[1]?.();
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent(
        "계량을 제출했어요 — 현금을 지급하고 사장님 확인을 받아요",
      ),
    );
    expect(screen.queryByTestId("upload-progress")).not.toBeInTheDocument();
  });

  it("업로드 실패: 에러 토스트(인라인 검증 에러와 별개)", async () => {
    mockStorageFrom.mockReturnValue({
      upload: vi.fn(() => Promise.resolve({ error: new Error("스토리지 업로드 실패") })),
      createSignedUrl: vi.fn(),
    });
    renderRun(makeRun({ status: "ARRIVED" }));
    fillMeasureForm();
    fireEvent.click(screen.getByTestId("submit-measure-button"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("스토리지 업로드 실패"),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("ActiveRunPage — 사장님께 전화(06 E8-④)", () => {
  it("ACCEPTED + supplierPhone 있으면 tel: 버튼 렌더", () => {
    renderRun(
      makeRun({ status: "ACCEPTED", supplierPhone: "01012345678", supplierName: "왕돈까스" }),
    );
    const button = screen.getByTestId("call-supplier-button");
    expect(button).toHaveAttribute("href", "tel:01012345678");
    expect(button).toHaveTextContent("사장님께 전화");
    expect(button).toHaveAttribute("aria-label", "왕돈까스 사장님께 전화");
  });

  it("ARRIVED에서도 렌더, phone 없으면(null) 미렌더", () => {
    const { unmount } = renderRun(makeRun({ status: "ARRIVED", supplierPhone: "01012345678" }));
    expect(screen.getByTestId("call-supplier-button")).toBeInTheDocument();
    unmount();

    renderRun(makeRun({ status: "ARRIVED", supplierPhone: null }));
    expect(screen.queryByTestId("call-supplier-button")).not.toBeInTheDocument();
  });

  it("COMPLETED에서는 미렌더(현장 소통 단계 아님)", () => {
    renderRun(
      makeRun({
        status: "COMPLETED",
        finalKg: 40,
        cashPaidAmount: 64000,
        completedAt: "2026-07-09T00:00:00Z",
        supplierPhone: "01012345678",
      }),
    );
    expect(screen.queryByTestId("call-supplier-button")).not.toBeInTheDocument();
  });
});

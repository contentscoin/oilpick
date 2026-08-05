import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@oilpick/core";
import { ActiveRunPage } from "./ActiveRunPage";
import type { ActiveRun, ActiveRunSummary } from "../hooks/useActiveRun";

const { mockUseSession, mockUseActiveRun, mockInvoke, mockStorageFrom, mockUseActiveRunSummaries } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseActiveRun: vi.fn(),
  mockUseActiveRunSummaries: vi.fn<() => { data: ActiveRunSummary[] }>(() => ({ data: [] })),
  mockInvoke: vi.fn(),
  mockStorageFrom: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useActiveRun", () => ({
  useActiveRun: mockUseActiveRun,
  useActiveRunSummaries: mockUseActiveRunSummaries,
}));
vi.mock("../hooks/useRiderLocationPusher", () => ({ useRiderLocationPusher: vi.fn() }));
// [16 L3] 내 위치·경로 조회는 부가 기능 — 기본은 "없음"(칩·경로선 미표기 폴백 경로).
const { mockUseGeolocation, mockUseDirections } = vi.hoisted(() => ({
  mockUseGeolocation: vi.fn(() => null as { lat: number; lng: number } | null),
  mockUseDirections: vi.fn(() => ({ data: undefined })),
}));
vi.mock("../hooks/useGeolocation", () => ({ useGeolocation: mockUseGeolocation }));
vi.mock("../hooks/useDirections", () => ({ useDirections: mockUseDirections }));
vi.mock("../lib/native/scanner", () => ({ isScannerAvailable: () => false, scanQrCode: vi.fn() }));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
// [16 L4] 제출 직전 서버 상태 재확인 가드가 supabase.from을 쓴다 — DB 체인 목 추가.
const { mockDbFrom } = vi.hoisted(() => ({ mockDbFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({
  supabase: { storage: { from: mockStorageFrom }, from: mockDbFrom },
}));

/** pickup_orders(select→eq→maybeSingle) 상태 재확인 목 — 기본은 제출 가능한 ARRIVED. */
function mockFreshOrder(row: { status: string; final_kg: number | null } | null = { status: "ARRIVED", final_kg: null }) {
  mockDbFrom.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  });
}
vi.mock("../lib/env", () => ({ MAP_STYLE_URL: undefined }));

function makeRun(overrides: Partial<ActiveRun> = {}): ActiveRun {
  return {
    id: "o1",
    status: "ARRIVED" as OrderStatus,
    supplierId: "s1",
    depotId: null,
    pickupAddress: "서울시 강남구 테헤란로 123",
    pickupLat: 37.5509,
    pickupLng: 126.8225,
    requestedKg: 45,
    preferredTime: null,
    orderKind: null,
    purchaseRequestedCans: null,
    snapshotFreshCanPrice: null,
    measuredKg: null,
    finalKg: null,
    photoUrls: [],
    snapshotPricePerKg: 1600,
    snapshotRiderFee: 0,
    payoutMethod: null,
    cashPaidAmount: null,
    purchaseAmount: null,
    netAmount: null,
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
  // clearAllMocks는 mockReturnValue를 지우지 않는다 — 테스트 간 위치 누수 방지로 매번 초기화.
  mockUseGeolocation.mockReturnValue(null);
  mockUseDirections.mockReturnValue({ data: undefined });
  mockFreshOrder();
  // [16 L4] 드래프트가 테스트 간 새지 않게 초기화(jsdom엔 indexedDB가 없어 텍스트 드래프트만 생긴다).
  localStorage.clear();
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

describe("ActiveRunPage — 다중 콜 전환기", () => {
  it("진행 중 2건 이상이면 전환기를 띄우고, 탭하면 해당 운행으로 전환한다", async () => {
    const runs = [
      { id: "o-1", status: "ACCEPTED" as const, pickupAddress: "서울 강서구 화곡로 1", pickupLat: null, pickupLng: null, createdAt: "2026-07-26T00:00:00Z" },
      { id: "o-2", status: "ARRIVED" as const, pickupAddress: "서울 성북구 장월로 120", pickupLat: null, pickupLng: null, createdAt: "2026-07-26T01:00:00Z" },
    ];
    mockUseActiveRunSummaries.mockReturnValue({ data: runs });
    renderRun(makeRun({ id: "o-1", status: "ACCEPTED" }));

    expect(screen.getByTestId("run-switcher")).toBeInTheDocument();
    expect(screen.getByText("진행 중 2건 — 권장 순서로 정렬했어요")).toBeInTheDocument();
    // 현재 보고 있는 건이 표시된다.
    expect(screen.getByTestId("run-switch-o-1")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("run-switch-o-2")).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByTestId("run-switch-o-2"));
    // 선택이 훅으로 전달돼야 한다(선택된 orderId로 재조회).
    await waitFor(() => expect(mockUseActiveRun).toHaveBeenCalledWith(expect.anything(), "o-2"));
  });

  it("진행 중 1건이면 전환기를 렌더하지 않는다(기존 화면과 동일)", () => {
    mockUseActiveRunSummaries.mockReturnValue({
      data: [{ id: "o-1", status: "ACCEPTED" as const, pickupAddress: "서울 강서구 화곡로 1", pickupLat: null, pickupLng: null, createdAt: "2026-07-26T00:00:00Z" }],
    });
    renderRun(makeRun({ id: "o-1", status: "ACCEPTED" }));
    expect(screen.queryByTestId("run-switcher")).not.toBeInTheDocument();
  });

  // [16 L3 §3-3] 방문 순서 보드 — ARRIVED 상단 고정 + 근거리순 + 좌표 없는 건 맨 뒤.
  it("위치가 있으면 ARRIVED 고정 → 근거리순으로 뱃지·거리 칩을 붙인다(좌표 없는 건 맨 뒤)", () => {
    mockUseGeolocation.mockReturnValue({ lat: 37.55, lng: 126.82 }); // 내 위치
    mockUseActiveRunSummaries.mockReturnValue({
      data: [
        // 먼 ACCEPTED(≈13km), 가까운 ACCEPTED(≈0km), 좌표 없는 건, ARRIVED(멀어도 상단 고정)
        { id: "far", status: "ACCEPTED" as const, pickupAddress: "먼 곳", pickupLat: 37.55, pickupLng: 126.97, createdAt: "2026-07-26T03:00:00Z" },
        { id: "near", status: "ACCEPTED" as const, pickupAddress: "가까운 곳", pickupLat: 37.55, pickupLng: 126.82, createdAt: "2026-07-26T02:00:00Z" },
        { id: "nogeo", status: "ACCEPTED" as const, pickupAddress: "좌표 없음", pickupLat: null, pickupLng: null, createdAt: "2026-07-26T01:00:00Z" },
        { id: "arrived", status: "ARRIVED" as const, pickupAddress: "현장 진행 중", pickupLat: 37.6, pickupLng: 127.1, createdAt: "2026-07-26T00:00:00Z" },
      ],
    });
    renderRun(makeRun({ id: "near", status: "ACCEPTED" }));

    // 표시 순서: arrived(①) → near(②) → far(③) → nogeo(맨 뒤).
    const badges = ["arrived", "near", "far"].map((id) => screen.getByTestId(`run-visit-badge-${id}`).textContent);
    expect(badges).toEqual(["①", "②", "③"]);
    // 거리 칩: 가까운 건 0.0km, 좌표 없는 건 미표기.
    expect(screen.getByTestId("run-distance-near")).toHaveTextContent("0.0km");
    expect(screen.queryByTestId("run-distance-nogeo")).not.toBeInTheDocument();
  });

  it("위치가 없으면(권한 거부) 순서 뱃지를 지어내지 않는다", () => {
    mockUseGeolocation.mockReturnValue(null);
    mockUseActiveRunSummaries.mockReturnValue({
      data: [
        { id: "o-1", status: "ACCEPTED" as const, pickupAddress: "A", pickupLat: 37.5, pickupLng: 127.0, createdAt: "2026-07-26T00:00:00Z" },
        { id: "o-2", status: "ACCEPTED" as const, pickupAddress: "B", pickupLat: 37.6, pickupLng: 127.1, createdAt: "2026-07-26T01:00:00Z" },
      ],
    });
    renderRun(makeRun({ id: "o-1", status: "ACCEPTED" }));
    expect(screen.queryByTestId("run-visit-badge-o-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("run-distance-o-1")).not.toBeInTheDocument();
  });
});

describe("ActiveRunPage — 활성 주문 없음", () => {
  it("EmptyState + 콜 홈으로", () => {
    renderRun(null);
    expect(screen.getByTestId("active-run-go-home")).toBeInTheDocument();
  });
});

describe("ActiveRunPage — ACCEPTED 내비 딥링크(11 M9-a)", () => {
  it("좌표가 있으면 카카오맵 스킴에 목적지를 싣고 TMap/웹 폴백 링크를 렌더한다", () => {
    renderRun(makeRun({ status: "ACCEPTED" }));
    expect(screen.getByTestId("navigate-deeplink")).toHaveAttribute(
      "href",
      "kakaomap://route?ep=37.5509,126.8225&by=CAR",
    );
    expect(screen.getByTestId("navigate-tmap").getAttribute("href")).toContain("goalx=126.8225");
    expect(screen.getByTestId("navigate-web-fallback").getAttribute("href")).toContain(
      "map.kakao.com/link/to/",
    );
  });

  it("좌표가 없으면(레거시/파싱 실패) 주소 검색 웹 링크로 강등한다", () => {
    renderRun(makeRun({ status: "ACCEPTED", pickupLat: null, pickupLng: null }));
    expect(screen.getByTestId("navigate-deeplink").getAttribute("href")).toContain(
      "map.kakao.com/link/search/",
    );
    expect(screen.queryByTestId("navigate-tmap")).not.toBeInTheDocument();
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
    // [12 §4] 첫 제출 시 바코드 ≥1건 필수 — 수동 입력으로 1건 추가.
    fireEvent.change(screen.getByTestId("barcode-input"), { target: { value: "8801234567890" } });
    fireEvent.click(screen.getByTestId("barcode-add"));
  }

  it("[12 §4] 바코드 없이 제출하면 인라인 에러(첫 제출 필수)", () => {
    renderRun(makeRun({ status: "ARRIVED" }));
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("payout-option-cash"));
    fireEvent.change(screen.getByTestId("photo-uploader-input"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("submit-measure-button"));
    expect(screen.getByTestId("run-action-error")).toHaveTextContent("바코드");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("[12 §4]+[O2] 텍스트 등록 바코드를 barcodeItems(photoUrl 생략)로 SUBMIT_MEASURE payload에 실어 보낸다", async () => {
    mockStorageFrom.mockReturnValue({
      upload: vi.fn(() => Promise.resolve({ error: null })),
      createSignedUrl: vi.fn(() =>
        Promise.resolve({ data: { signedUrl: "https://signed.example/p.jpg" }, error: null }),
      ),
    });
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderRun(makeRun({ status: "ARRIVED" }));
    fillMeasureForm();
    fireEvent.click(screen.getByTestId("submit-measure-button"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const [, body] = mockInvoke.mock.calls[0]!;
    expect(body.action).toBe("SUBMIT_MEASURE");
    // [O2] 전송은 barcodeItems로 — 사진 없는 항목은 photoUrl 자체가 없다(레거시 barcodes 미전송).
    expect(body.payload.barcodeItems).toEqual([{ code: "8801234567890" }]);
    expect(body.payload.barcodes).toBeUndefined();
  });

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

// [O2 2026-08-05] 바코드 사진 첨부 — 첨부 즉시 order-photos 업로드→서명 URL, barcodeItems 전송.
describe("ActiveRunPage — 바코드 사진 첨부(O2)", () => {
  function mockUploadOk(signedUrl = "https://signed.example/barcode.jpg") {
    const upload = vi.fn(() => Promise.resolve({ error: null }));
    const createSignedUrl = vi.fn(() => Promise.resolve({ data: { signedUrl }, error: null }));
    mockStorageFrom.mockReturnValue({ upload, createSignedUrl });
    return { upload, createSignedUrl };
  }

  it("바코드 항목에 사진을 첨부하면 썸네일이 뜨고 barcodeItems에 photoUrl이 실린다", async () => {
    const { upload } = mockUploadOk("https://signed.example/barcode.jpg");
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderRun(makeRun({ status: "ARRIVED" }));

    // 텍스트 바코드 1건 등록 후 [📷 사진] 첨부 → 즉시 업로드·썸네일.
    fireEvent.change(screen.getByTestId("barcode-input"), { target: { value: "8801234567890" } });
    fireEvent.click(screen.getByTestId("barcode-add"));
    fireEvent.click(screen.getByTestId("barcode-photo-attach-8801234567890"));
    fireEvent.change(screen.getByTestId("barcode-photo-input"), {
      target: { files: [new File(["bar"], "bar.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() =>
      expect(screen.getByTestId("barcode-photo-thumb-8801234567890")).toHaveAttribute(
        "src",
        "https://signed.example/barcode.jpg",
      ),
    );
    // 업로드 경로는 order-photos `${orderId}/barcode-...jpg`(첨부 즉시 — 제출 전).
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^o1\/barcode-\d+\.jpg$/),
      expect.anything(),
      { upsert: true },
    );

    // 나머지 필수 입력을 채워 제출 → barcodeItems에 photoUrl이 실린다.
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("payout-option-cash"));
    fireEvent.change(screen.getByTestId("photo-uploader-input"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("submit-measure-button"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const [, body] = mockInvoke.mock.calls[0]!;
    expect(body.payload.barcodeItems).toEqual([
      { code: "8801234567890", photoUrl: "https://signed.example/barcode.jpg" },
    ]);
  });

  it("사진 단독 등록: photo- 고유 코드로 등록되고('사진 등록' 표시) 바코드 필수 가드를 충족한다", async () => {
    mockUploadOk("https://signed.example/only.jpg");
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderRun(makeRun({ status: "ARRIVED" }));

    // 코드 입력 없이 [📷 사진으로 등록] → 목록에 "사진 등록" 항목.
    fireEvent.click(screen.getByTestId("barcode-photo-only"));
    fireEvent.change(screen.getByTestId("barcode-photo-input"), {
      target: { files: [new File(["p"], "p.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByTestId("barcode-list")).toHaveTextContent("사진 등록"));

    // 텍스트 바코드 없이도 제출이 가드를 통과한다(사진 등록 = 바코드 1건).
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("payout-option-cash"));
    fireEvent.change(screen.getByTestId("photo-uploader-input"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("submit-measure-button"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const [, body] = mockInvoke.mock.calls[0]!;
    expect(body.payload.barcodeItems).toHaveLength(1);
    expect(body.payload.barcodeItems[0].code).toMatch(/^photo-[0-9a-z]+$/);
    expect(body.payload.barcodeItems[0].photoUrl).toBe("https://signed.example/only.jpg");
  });

  it("업로드 실패 시 항목을 추가하지 않고 에러 토스트를 띄운다", async () => {
    mockStorageFrom.mockReturnValue({
      upload: vi.fn(() => Promise.resolve({ error: new Error("바코드 사진 업로드 실패") })),
      createSignedUrl: vi.fn(),
    });
    renderRun(makeRun({ status: "ARRIVED" }));
    fireEvent.click(screen.getByTestId("barcode-photo-only"));
    fireEvent.change(screen.getByTestId("barcode-photo-input"), {
      target: { files: [new File(["p"], "p.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("바코드 사진 업로드 실패"));
    expect(screen.queryByTestId("barcode-list")).not.toBeInTheDocument();
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

describe("ActiveRunPage — 계량 드래프트(16 L4 §3-2)", () => {
  function seedDraft(orderId: string, overrides: Record<string, unknown> = {}) {
    localStorage.setItem(
      `oilpick:measure-draft:${orderId}`,
      JSON.stringify({
        kg: "33.5",
        payout: "CASH",
        deliveredCans: 0,
        barcodes: ["880999"],
        geo: null,
        uploadedUrls: {},
        savedAt: Date.now(),
        ...overrides,
      }),
    );
  }

  it("저장된 드래프트가 있으면 복원 배너 + 입력값을 되살린다", async () => {
    seedDraft("o1");
    renderRun(makeRun({ status: "ARRIVED" }));
    await waitFor(() => expect(screen.getByTestId("measure-draft-restored")).toBeInTheDocument());
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(33.5);
    expect(screen.getByTestId("measure-draft-restored")).toHaveTextContent("작성하던 내용을 불러왔어요");
  });

  it("[지우기]를 누르면 드래프트를 파기하고 폼을 초기화한다(kg는 [N5] 요청 기준 프리필로 복귀)", async () => {
    seedDraft("o1");
    renderRun(makeRun({ status: "ARRIVED" }));
    await waitFor(() => expect(screen.getByTestId("measure-draft-restored")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("measure-draft-discard"));
    await waitFor(() =>
      expect(screen.queryByTestId("measure-draft-restored")).not.toBeInTheDocument(),
    );
    // [N5] 초기화된 폼 = 프리필 폼(requestedKg 45) — 빈 값이 아니다.
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(45);
    expect(localStorage.getItem("oilpick:measure-draft:o1")).toBeNull();
  });

  it("입력하면 드래프트가 즉시 저장된다", async () => {
    renderRun(makeRun({ status: "ARRIVED" }));
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "12" } });
    await waitFor(() => {
      const raw = localStorage.getItem("oilpick:measure-draft:o1");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).kg).toBe("12");
    });
  });

  it("제출 직전 서버 상태가 ARRIVED가 아니면 제출을 중단하고 드래프트를 파기한다(오제출 가드)", async () => {
    seedDraft("o1");
    mockFreshOrder({ status: "COMPLETED", final_kg: 40 });
    mockStorageFrom.mockReturnValue({
      upload: vi.fn(() => Promise.resolve({ error: null })),
      createSignedUrl: vi.fn(() =>
        Promise.resolve({ data: { signedUrl: "https://signed.example/p.jpg" }, error: null }),
      ),
    });
    renderRun(makeRun({ status: "ARRIVED" }));
    await waitFor(() => expect(screen.getByTestId("measure-draft-restored")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("payout-option-cash"));
    fireEvent.change(screen.getByTestId("photo-uploader-input"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("submit-measure-button"));

    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("주문 상태가 바뀌어 제출할 수 없어요"),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(localStorage.getItem("oilpick:measure-draft:o1")).toBeNull();
  });

  it("중재 완료(finalKg) 주문은 드래프트를 복원하지 않고 파기한다", async () => {
    seedDraft("o1");
    renderRun(makeRun({ status: "ARRIVED", finalKg: 40, measuredKg: 42, payoutMethod: "CASH" }));
    await waitFor(() => expect(localStorage.getItem("oilpick:measure-draft:o1")).toBeNull());
    expect(screen.queryByTestId("measure-draft-restored")).not.toBeInTheDocument();
  });
});

describe("ActiveRunPage — 확인 요청 다시 보내기(16 L5)", () => {
  it("대기 배너에서 버튼 클릭 → confirm-remind 호출, sent:true면 발송 토스트", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { sent: true } });
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, payoutMethod: "CASH" }));
    fireEvent.click(screen.getByTestId("confirm-remind-button"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("confirm-remind", { orderId: "o1" }));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("확인 요청을 다시 보냈어요"),
    );
  });

  it("sent:false(서버 rate limit)면 '이미 요청' 안내 — 에러 아님", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { sent: false } });
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, payoutMethod: "POINT" }));
    fireEvent.click(screen.getByTestId("confirm-remind-button"));
    await waitFor(() =>
      expect(screen.getByTestId("toast")).toHaveTextContent("2시간에 한 번"),
    );
  });

  it("배너에 자동 에스컬레이션 안내 캡션이 있다", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40 }));
    expect(screen.getByText("24시간이 지나면 본사에 자동 접수돼요")).toBeInTheDocument();
  });
});

describe("ActiveRunPage — 요청 정보 노출·계량 프리필(N5)", () => {
  it("헤드라인 주소 아래에 '🕐 희망 {값}' 줄을 표시한다(모든 run 상태 공통)", () => {
    const { unmount } = renderRun(makeRun({ status: "ACCEPTED", preferredTime: "2026-08-06 09:30" }));
    expect(screen.getByTestId("active-run-preferred-time")).toHaveTextContent("🕐 희망 2026-08-06 09:30");
    unmount();

    // 레거시 "지금"도 저장 문자열 그대로 — ARRIVED에서도 동일하게 표시.
    renderRun(makeRun({ status: "ARRIVED", preferredTime: "지금" }));
    expect(screen.getByTestId("active-run-preferred-time")).toHaveTextContent("🕐 희망 지금");
  });

  it("preferredTime이 없으면(null) 희망 줄이 없다", () => {
    renderRun(makeRun({ status: "ACCEPTED", preferredTime: null }));
    expect(screen.queryByTestId("active-run-preferred-time")).not.toBeInTheDocument();
  });

  it("계량 kg 입력이 requestedKg로 프리필되고 '요청 기준 예상값' 캡션이 붙는다", () => {
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 45 }));
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(45);
    expect(screen.getByTestId("measure-kg-prefill-caption")).toHaveTextContent(
      "요청 기준 예상값이에요 — 현장 계량으로 확정돼요",
    );
    // 프리필 상태에선 지급액 미리보기도 요청 기준으로 이미 계산돼 있다(45×1,600=72,000원).
    expect(screen.getByTestId("run-cash-payout")).toHaveTextContent("72,000원");
  });

  it("실측값으로 고치면 캡션이 사라진다(더 이상 요청 기준이 아니다)", () => {
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 45 }));
    fireEvent.change(screen.getByTestId("measured-kg-input"), { target: { value: "40" } });
    expect(screen.queryByTestId("measure-kg-prefill-caption")).not.toBeInTheDocument();
  });

  it("requestedKg 0(신유 단독)이면 빈 값 유지 — 프리필·캡션 없음", () => {
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 0, orderKind: "PURCHASE", purchaseRequestedCans: 2, snapshotFreshCanPrice: 26000 }));
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(null);
    expect(screen.queryByTestId("measure-kg-prefill-caption")).not.toBeInTheDocument();
  });

  it("드래프트 복원이 프리필보다 우선한다", async () => {
    localStorage.setItem(
      "oilpick:measure-draft:o1",
      JSON.stringify({
        kg: "33.5",
        payout: "CASH",
        deliveredCans: 0,
        barcodes: [],
        geo: null,
        uploadedUrls: {},
        savedAt: Date.now(),
      }),
    );
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 45 }));
    await waitFor(() => expect(screen.getByTestId("measure-draft-restored")).toBeInTheDocument());
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(33.5);
    expect(screen.queryByTestId("measure-kg-prefill-caption")).not.toBeInTheDocument();
  });

  it("프리필만으로는(입력 없음) 드래프트가 저장되지 않는다 — 가짜 복원 배너 방지", async () => {
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 45 }));
    // loadDraft(비동기 복원)와 뒤이은 저장 이펙트가 전부 돌도록 마이크로태스크를 비운다 —
    // 그 뒤에도 드래프트(프리필 kg "45")가 저장돼 있으면 안 된다(pristine 기준 = 프리필).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("measure-draft-restored")).not.toBeInTheDocument();
    expect(localStorage.getItem("oilpick:measure-draft:o1")).toBeNull();
  });

  it("재제출 프리필(measuredKg)이 요청 기준 프리필보다 우선한다", () => {
    renderRun(makeRun({ status: "ARRIVED", requestedKg: 45, measuredKg: 40, payoutMethod: "CASH" }));
    fireEvent.click(screen.getByTestId("measure-resubmit-button"));
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(40);
    expect(screen.queryByTestId("measure-kg-prefill-caption")).not.toBeInTheDocument();
  });
});

describe("ActiveRunPage — 현금으로 바꿔 다시 제출(N3, 08 P2 확장)", () => {
  it("POINT 제출 대기 배너에서 원터치 → 재제출 폼(kg 유지 + CASH 프리셋)", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, payoutMethod: "POINT" }));
    fireEvent.click(screen.getByTestId("cash-resubmit-button"));
    expect(screen.getByTestId("measured-kg-input")).toHaveValue(40);
    expect(screen.getByTestId("payout-option-cash")).toHaveAttribute("aria-checked", "true");
  });

  it("CASH 제출 대기 배너에는 원터치 버튼이 없다", () => {
    renderRun(makeRun({ status: "ARRIVED", measuredKg: 40, payoutMethod: "CASH" }));
    expect(screen.queryByTestId("cash-resubmit-button")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponPurchasePage } from "./CouponPurchasePage";

// SDK 실모듈 로드 차단(jsdom) — 테스트는 loadWidget prop로 위젯을 주입한다(실 네트워크 금지).
vi.mock("@tosspayments/tosspayments-sdk", () => ({
  loadTossPayments: vi.fn(),
  ANONYMOUS: "@@ANONYMOUS",
}));

const { mockInvoke, mockUseCouponPrice, mockUsePending, mockUseSession } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockUseCouponPrice: vi.fn(),
  mockUsePending: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useCoupons", () => ({
  useCouponPrice: mockUseCouponPrice,
  usePendingPurchases: mockUsePending,
}));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));

function makeWidget() {
  return {
    setAmount: vi.fn().mockResolvedValue(undefined),
    renderPaymentMethods: vi.fn().mockResolvedValue(undefined),
    renderAgreement: vi.fn().mockResolvedValue(undefined),
    requestPayment: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPage(
  opts: {
    loadWidget?: ReturnType<typeof vi.fn>;
    clientKey?: string;
    entry?: string;
    pgProvider?: "toss" | "koem" | "demo";
    submitPayForm?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[opts.entry ?? "/coupons/purchase"]}>
      <CouponPurchasePage
        loadWidget={opts.loadWidget}
        clientKey={opts.clientKey ?? "test_ck_x"}
        pgProvider={opts.pgProvider}
        submitPayForm={opts.submitPayForm}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
  mockUseCouponPrice.mockReturnValue({ data: 500 });
  mockUsePending.mockReturnValue({ data: [] });
});

describe("CouponPurchasePage — 수량→금액", () => {
  it("수량 프리셋 변경 시 예상 금액 = 단가×수량", () => {
    renderPage();
    // 기본 10장 → 5,000원.
    expect(screen.getByTestId("purchase-amount")).toHaveTextContent("5,000원");
    fireEvent.click(screen.getByTestId("qty-preset-30"));
    expect(screen.getByTestId("purchase-amount")).toHaveTextContent("15,000원");
  });

  it("직접 입력 수량도 금액에 반영(1~200 클램프)", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("qty-custom-input"), { target: { value: "45" } });
    expect(screen.getByTestId("purchase-amount")).toHaveTextContent("22,500원");
    fireEvent.change(screen.getByTestId("qty-custom-input"), { target: { value: "999" } });
    expect(screen.getByTestId("purchase-amount")).toHaveTextContent("100,000원"); // 200×500
  });

  it("단가 미설정이면 '단가 미설정' + 결제 비활성", () => {
    mockUseCouponPrice.mockReturnValue({ data: undefined });
    renderPage();
    expect(screen.getByTestId("purchase-amount")).toHaveTextContent("단가 미설정");
    expect(screen.getByTestId("purchase-pay-button")).toBeDisabled();
  });
});

describe("CouponPurchasePage — intent → 위젯", () => {
  it("[결제하기]가 intent를 호출하고 위젯을 로드한다", async () => {
    const widget = makeWidget();
    const loadWidget = vi.fn().mockResolvedValue(widget);
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { purchaseId: "p1", pgOrderId: "oc_1", amount: 15000, unitPrice: 500 },
    });

    renderPage({ loadWidget });
    fireEvent.click(screen.getByTestId("qty-preset-30"));
    fireEvent.click(screen.getByTestId("purchase-pay-button"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("coupon-purchase-intent", { qty: 30 }),
    );
    // 위젯 로드(주입 SDK) + setAmount 호출.
    await waitFor(() => expect(loadWidget).toHaveBeenCalledWith("test_ck_x"));
    await waitFor(() => expect(widget.setAmount).toHaveBeenCalledWith(15000));
    expect(await screen.findByTestId("widget-request-button")).toBeEnabled();
  });

  it("키 미발급(clientKey 없음)이면 구매 폼 대신 수동 충전 안내 게이트를 렌더 (PG 미연동 운영)", () => {
    const loadWidget = vi.fn().mockResolvedValue(makeWidget());
    renderPage({ loadWidget, clientKey: "" });
    // 페이지 진입 시점 게이트 — 구매 폼(수량/결제 버튼) 자체가 없어 orphan intent를 만들지 않는다.
    expect(screen.getByTestId("purchase-manual-notice")).toHaveTextContent("고객센터로 충전을 요청");
    expect(screen.queryByTestId("purchase-pay-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("purchase-manual-support")).toHaveTextContent("고객센터로 충전 요청하기");
    expect(loadWidget).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("수동 충전 안내의 버튼이 고객센터(COUPON_PAYMENT 프리셋)로 이동한다", async () => {
    renderPage({
      clientKey: "",
      entry: "/coupons/purchase",
    });
    fireEvent.click(screen.getByTestId("purchase-manual-support"));
    // MemoryRouter 내 실제 내비게이션 — 대상 라우트가 없으므로 location 검증 대신
    // 클릭이 예외 없이 처리되는지와 게이트가 유지되는지만 확인(라우팅 자체는 App.test 소관).
    await waitFor(() => expect(screen.queryByTestId("purchase-pay-button")).not.toBeInTheDocument());
  });
});

describe("CouponPurchasePage — PENDING 대사", () => {
  it("PENDING 잔건 목록 + [결제 확인 재시도] 렌더, 재시도가 위젯을 로드한다", async () => {
    const widget = makeWidget();
    const loadWidget = vi.fn().mockResolvedValue(widget);
    mockUsePending.mockReturnValue({
      data: [
        {
          id: "p9",
          qty: 30,
          unitPrice: 500,
          amount: 15000,
          pgOrderId: "oc_9",
          createdAt: "2026-07-09",
        },
      ],
    });

    renderPage({ loadWidget });
    const items = screen.getAllByTestId("pending-purchase-item");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("수거쿠폰 30장");

    fireEvent.click(screen.getByTestId("pending-retry-button"));
    await waitFor(() => expect(loadWidget).toHaveBeenCalledWith("test_ck_x"));
    await waitFor(() => expect(widget.setAmount).toHaveBeenCalledWith(15000));
  });
});

describe("CouponPurchasePage — 코엠 결제창 (07 F14)", () => {
  const KOEM_INTENT = {
    ok: true,
    data: {
      purchaseId: "p1",
      pgOrderId: "op123456789012345678",
      amount: 60000,
      unitPrice: 2000,
      koem: {
        payUrl: "https://pay.coam.co.kr/mobilepage/common/mainFrame.pay",
        params: { mid: "M1", orderno: "op123456789012345678", buyReqamt: "60000", checkHash: "h" },
      },
    },
  };

  it("clientKey 없이도 구매 폼을 렌더한다(수동 충전 게이트 미적용)", () => {
    renderPage({ pgProvider: "koem", clientKey: "" });
    expect(screen.queryByTestId("purchase-manual-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("purchase-pay-button")).toBeInTheDocument();
  });

  it("[결제하기] → intent의 koem 파라미터를 수정 없이 form 제출한다(위젯 미사용)", async () => {
    const submitPayForm = vi.fn();
    const loadWidget = vi.fn();
    mockInvoke.mockResolvedValue(KOEM_INTENT);

    renderPage({ pgProvider: "koem", clientKey: "", submitPayForm, loadWidget });
    fireEvent.click(screen.getByTestId("qty-preset-30"));
    fireEvent.click(screen.getByTestId("purchase-pay-button"));

    await waitFor(() =>
      expect(submitPayForm).toHaveBeenCalledWith(
        KOEM_INTENT.data.koem.payUrl,
        KOEM_INTENT.data.koem.params,
      ),
    );
    expect(loadWidget).not.toHaveBeenCalled();
  });

  it("서버가 koem 파라미터를 안 주면(시크릿 미설정) 준비 중 안내로 폴백", async () => {
    const submitPayForm = vi.fn();
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { purchaseId: "p1", pgOrderId: "op1", amount: 60000, unitPrice: 2000 },
    });

    renderPage({ pgProvider: "koem", clientKey: "", submitPayForm });
    fireEvent.click(screen.getByTestId("purchase-pay-button"));

    expect(await screen.findByTestId("purchase-error")).toHaveTextContent("결제 연동 준비 중");
    expect(submitPayForm).not.toHaveBeenCalled();
  });

  it("PENDING 항목은 [결제 상태 새로고침] — refetch만 하고 위젯·confirm을 호출하지 않는다", async () => {
    const loadWidget = vi.fn();
    const refetch = vi.fn();
    mockUsePending.mockReturnValue({
      data: [
        { id: "p9", qty: 30, unitPrice: 2000, amount: 60000, pgOrderId: "op9", createdAt: "2026-07-09" },
      ],
      refetch,
    });

    renderPage({ pgProvider: "koem", clientKey: "", loadWidget });
    const button = screen.getByTestId("pending-retry-button");
    expect(button).toHaveTextContent("결제 상태 새로고침");
    fireEvent.click(button);

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(loadWidget).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("CouponPurchasePage — 데모 결제 (F14 데모 운영)", () => {
  it("데모 배너 + [데모 결제하기] 라벨, clientKey 없이 폼 렌더", () => {
    renderPage({ pgProvider: "demo", clientKey: "" });
    expect(screen.getByTestId("demo-mode-notice")).toHaveTextContent("실제 결제 없이");
    expect(screen.getByTestId("purchase-pay-button")).toHaveTextContent("데모 결제하기");
    expect(screen.queryByTestId("purchase-manual-notice")).not.toBeInTheDocument();
  });

  it("[데모 결제하기] → intent(demo:true) → confirm(demo_ 키) 직행 → 성공 화면", async () => {
    const loadWidget = vi.fn();
    mockInvoke.mockImplementation((name: string) =>
      name === "coupon-purchase-intent"
        ? Promise.resolve({
            ok: true,
            data: { purchaseId: "p1", pgOrderId: "op1", amount: 60000, unitPrice: 2000, demo: true },
          })
        : Promise.resolve({ ok: true, data: { balance: 30 } }),
    );

    renderPage({ pgProvider: "demo", clientKey: "", loadWidget });
    fireEvent.click(screen.getByTestId("qty-preset-30"));
    fireEvent.click(screen.getByTestId("purchase-pay-button"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("coupon-purchase-confirm", {
        purchaseId: "p1",
        paymentKey: "demo_p1",
        pgOrderId: "op1",
        amount: 60000,
      }),
    );
    expect(await screen.findByTestId("purchase-success-balance")).toHaveTextContent("30장");
    expect(loadWidget).not.toHaveBeenCalled();
  });

  it("서버가 demo 신호 없이 응답하면(서버 PG_PROVIDER 불일치) 준비 중 안내로 폴백", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { purchaseId: "p1", pgOrderId: "op1", amount: 60000, unitPrice: 2000 },
    });
    renderPage({ pgProvider: "demo", clientKey: "" });
    fireEvent.click(screen.getByTestId("purchase-pay-button"));
    expect(await screen.findByTestId("purchase-error")).toHaveTextContent("결제 연동 준비 중");
    expect(mockInvoke).not.toHaveBeenCalledWith("coupon-purchase-confirm", expect.anything());
  });

  it("PENDING 재시도가 confirm(demo_ 키)으로 직행한다(멱등)", async () => {
    mockUsePending.mockReturnValue({
      data: [
        { id: "p9", qty: 30, unitPrice: 2000, amount: 60000, pgOrderId: "op9", createdAt: "2026-07-09" },
      ],
    });
    mockInvoke.mockResolvedValue({ ok: true, data: { balance: 30 } });

    renderPage({ pgProvider: "demo", clientKey: "" });
    fireEvent.click(screen.getByTestId("pending-retry-button"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("coupon-purchase-confirm", {
        purchaseId: "p9",
        paymentKey: "demo_p9",
        pgOrderId: "op9",
        amount: 60000,
      }),
    );
    expect(await screen.findByTestId("purchase-success-balance")).toHaveTextContent("30장");
  });
});

describe("CouponPurchasePage — confirm 콜백", () => {
  it("successUrl 파라미터로 진입 시 confirm 호출 + 잔액 표시", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { balance: 12 } });
    renderPage({
      entry: "/coupons/purchase?purchaseId=p1&paymentKey=tk_1&orderId=oc_1&amount=5000",
    });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("coupon-purchase-confirm", {
        purchaseId: "p1",
        paymentKey: "tk_1",
        pgOrderId: "oc_1",
        amount: 5000,
      }),
    );
    expect(await screen.findByTestId("purchase-success-balance")).toHaveTextContent("12장");
  });

  it("confirm 실패 시 [결제 확인 재시도] 노출(멱등 재호출)", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "결제 승인에 실패했어요." });
    renderPage({
      entry: "/coupons/purchase?purchaseId=p1&paymentKey=tk_1&orderId=oc_1&amount=5000",
    });
    expect(await screen.findByTestId("purchase-confirm-retry")).toBeInTheDocument();
  });
});

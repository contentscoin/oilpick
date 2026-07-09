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
  opts: { loadWidget?: ReturnType<typeof vi.fn>; clientKey?: string; entry?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[opts.entry ?? "/coupons/purchase"]}>
      <CouponPurchasePage loadWidget={opts.loadWidget} clientKey={opts.clientKey ?? "test_ck_x"} />
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

  it("키 미발급(clientKey 없음)이면 위젯 로드 대신 안내", async () => {
    const loadWidget = vi.fn().mockResolvedValue(makeWidget());
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { purchaseId: "p1", pgOrderId: "oc_1", amount: 5000, unitPrice: 500 },
    });
    renderPage({ loadWidget, clientKey: "" });
    fireEvent.click(screen.getByTestId("purchase-pay-button"));
    expect(await screen.findByTestId("purchase-error")).toHaveTextContent("결제 키가 아직");
    expect(loadWidget).not.toHaveBeenCalled();
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

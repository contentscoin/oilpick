import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import type { AdminOrderDetail, AdminOrderEvent } from "../hooks/useOrdersAdmin";

/**
 * OrderDetailDrawer 07 F10-⑤ 검증:
 * - coupon_cost/환급 여부(REFUND 원장)/cash_paid_amount 표시(포인트 표기 제거)
 * - admin 취소: 귀책(fault) 3종 선택 + 각 의미 설명 + 환급 결과 예고 카피,
 *   미선택 시 호출 불가, CANCEL 페이로드에 fault 포함({ACCEPTED|ARRIVED|DISPUTED}만 노출)
 * - FORCE_COMPLETE: 계량 제출된 ARRIVED 한정 노출 + 사유(memo) 필수 + 페이로드
 * - RESOLVE_DISPUTE: "중재 후 ARRIVED 복귀·점주 확인 필요" 카피 교정
 */

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("../lib/edgeFunction", () => ({
  invokeEdgeFunction: mockInvoke,
}));

function makeOrder(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    id: "order-1",
    status: "DISPUTED",
    supplierId: "sup-1",
    supplierName: "행복식당",
    riderId: "rider-1",
    riderName: "김라이더",
    requestedKg: 30,
    measuredKg: 22.5,
    finalKg: null,
    pickupAddress: "서울 강서구 1",
    createdAt: "2026-07-01T00:00:00.000Z",
    photoUrls: [],
    disputeReason: "계량이 너무 적어요",
    cancelReason: null,
    snapshotPricePerKg: 900,
    couponCost: 2,
    cashPaidAmount: null,
    completedAt: null,
    refunded: false,
    ...overrides,
  };
}

const NO_EVENTS: AdminOrderEvent[] = [];

function renderDrawer(order: AdminOrderDetail, onMutated = vi.fn()) {
  render(
    <OrderDetailDrawer order={order} events={NO_EVENTS} isLoading={false} onClose={vi.fn()} onMutated={onMutated} />,
  );
  return { onMutated };
}

afterEach(() => {
  mockInvoke.mockReset();
});

describe("쿠폰/현금 표기 (07 F10-⑤)", () => {
  it("coupon_cost·환급 여부·cash_paid_amount를 표시한다", () => {
    renderDrawer(
      makeOrder({ status: "COMPLETED", finalKg: 25, cashPaidAmount: 22500, refunded: false, disputeReason: null }),
    );
    expect(screen.getByTestId("order-coupon-cost")).toHaveTextContent("2장");
    expect(screen.getByTestId("order-cash-paid")).toHaveTextContent("22,500원");
    expect(screen.getByTestId("order-coupon-refunded")).toHaveTextContent("-");
    // 구모델 포인트 표기 부재.
    expect(screen.queryByText(/포인트/)).not.toBeInTheDocument();
  });

  it("REFUND 원장이 있는 취소 주문은 '환급됨' 배지를 표시한다", () => {
    renderDrawer(makeOrder({ status: "CANCELLED", refunded: true, disputeReason: null, cancelReason: "점주 노쇼" }));
    expect(screen.getByTestId("order-coupon-refunded")).toHaveTextContent("환급됨");
  });

  it("레거시 주문(coupon_cost null)은 '- (레거시)'로 표기한다", () => {
    renderDrawer(makeOrder({ couponCost: null }));
    expect(screen.getByTestId("order-coupon-cost")).toHaveTextContent("- (레거시)");
  });
});

describe("모달/드로어 a11y", () => {
  it("role=dialog·aria-modal을 노출하고 Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <OrderDetailDrawer order={makeOrder()} events={NO_EVENTS} isLoading={false} onClose={onClose} onMutated={vi.fn()} />,
    );
    const drawer = screen.getByTestId("order-drawer");
    expect(drawer).toHaveAttribute("role", "dialog");
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer).toHaveAttribute("aria-label", "주문 상세");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("admin 취소 — 귀책(fault) 선택 (D4)", () => {
  it("ACCEPTED 주문에 fault 3종 라디오와 설명 문구를 노출한다", () => {
    renderDrawer(makeOrder({ status: "ACCEPTED", measuredKg: null, disputeReason: null }));
    expect(screen.getByTestId("fault-option-SUPPLIER")).toBeInTheDocument();
    expect(screen.getByTestId("fault-option-RIDER")).toBeInTheDocument();
    expect(screen.getByTestId("fault-option-SYSTEM")).toBeInTheDocument();
    expect(screen.getByText(/노쇼·현장 거래 거부/)).toBeInTheDocument();
    expect(screen.getByText(/미방문·수거 불이행/)).toBeInTheDocument();
    expect(screen.getByText(/시세 오등록·매칭 오류/)).toBeInTheDocument();
  });

  it("fault 미선택이면 취소 버튼이 비활성이고 호출되지 않는다", () => {
    renderDrawer(makeOrder({ status: "ACCEPTED", measuredKg: null, disputeReason: null }));
    const button = screen.getByTestId("cancel-order-button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("SUPPLIER 선택 시 '쿠폰 N장 자동 환급' 예고를, RIDER 선택 시 '환급 없음'을 보여준다", () => {
    renderDrawer(makeOrder({ status: "ARRIVED", couponCost: 3, disputeReason: null }));
    fireEvent.click(screen.getByTestId("fault-option-SUPPLIER"));
    expect(screen.getByTestId("fault-refund-preview")).toHaveTextContent("쿠폰 3장 자동 환급");

    fireEvent.click(screen.getByTestId("fault-option-RIDER"));
    expect(screen.getByTestId("fault-refund-preview")).toHaveTextContent("쿠폰 환급 없음(소진 유지)");

    fireEvent.click(screen.getByTestId("fault-option-SYSTEM"));
    expect(screen.getByTestId("fault-refund-preview")).toHaveTextContent("쿠폰 3장 자동 환급");
  });

  it("fault 선택 후 취소하면 CANCEL 페이로드에 fault를 담는다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderDrawer(makeOrder({ status: "DISPUTED" }));
    fireEvent.click(screen.getByTestId("fault-option-SYSTEM"));
    fireEvent.change(screen.getByTestId("cancel-reason-input"), { target: { value: "시세 오등록" } });
    fireEvent.click(screen.getByTestId("cancel-order-button"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("order-transition", {
      orderId: "order-1",
      action: "CANCEL",
      payload: { reason: "시세 오등록", fault: "SYSTEM" },
    });
  });

  it("REQUESTED에는 admin 취소 폼이 없다({ACCEPTED|ARRIVED|DISPUTED} 한정)", () => {
    renderDrawer(makeOrder({ status: "REQUESTED", measuredKg: null, disputeReason: null }));
    expect(screen.queryByTestId("cancel-order-button")).not.toBeInTheDocument();
  });
});

describe("FORCE_COMPLETE (D6)", () => {
  it("계량 제출된 ARRIVED에만 노출된다", () => {
    renderDrawer(makeOrder({ status: "ARRIVED", measuredKg: 22.5, disputeReason: null }));
    expect(screen.getByTestId("force-complete-button")).toBeInTheDocument();
  });

  it("계량 없는 ARRIVED에는 노출되지 않는다", () => {
    renderDrawer(makeOrder({ status: "ARRIVED", measuredKg: null, finalKg: null, disputeReason: null }));
    expect(screen.queryByTestId("force-complete-button")).not.toBeInTheDocument();
  });

  it("DISPUTED에는 노출되지 않는다(중재 폼만)", () => {
    renderDrawer(makeOrder({ status: "DISPUTED", measuredKg: 22.5 }));
    expect(screen.queryByTestId("force-complete-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("resolve-dispute-submit")).toBeInTheDocument();
  });

  it("사유 없이 제출하면 호출 없이 에러를 낸다(memo 필수)", async () => {
    renderDrawer(makeOrder({ status: "ARRIVED", measuredKg: 22.5, disputeReason: null }));
    fireEvent.submit(screen.getByTestId("force-complete-button"));
    expect(await screen.findByText("강제 완결 사유를 입력해주세요(필수).")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("사유 입력 후 제출하면 FORCE_COMPLETE 페이로드로 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    const { onMutated } = renderDrawer(makeOrder({ status: "ARRIVED", measuredKg: 22.5, disputeReason: null }));
    fireEvent.change(screen.getByTestId("force-complete-memo"), { target: { value: "점주 확인 방치 3일" } });
    fireEvent.submit(screen.getByTestId("force-complete-button"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("order-transition", {
      orderId: "order-1",
      action: "FORCE_COMPLETE",
      payload: { memo: "점주 확인 방치 3일" },
    });
    expect(await screen.findByText("관리자 확인으로 주문이 완료 처리되었어요.")).toBeInTheDocument();
    expect(onMutated).toHaveBeenCalled();
  });
});

describe("RESOLVE_DISPUTE 카피 교정 (07 §1-3)", () => {
  it("중재 폼에 'ARRIVED 복귀·점주 확인 필요' 안내가 있다", () => {
    renderDrawer(makeOrder());
    expect(screen.getByText(/확정 후 주문은 현장 도착\(ARRIVED\)으로 복귀/)).toBeInTheDocument();
    expect(screen.getByTestId("resolve-dispute-submit")).toHaveTextContent("ARRIVED 복귀");
  });

  it("정상 finalKg 제출 시 RESOLVE_DISPUTE 호출 + 복귀 카피를 보여준다(포인트 지급 카피 아님)", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    renderDrawer(makeOrder());
    fireEvent.change(screen.getByTestId("resolve-dispute-final-kg"), { target: { value: "24.5" } });
    fireEvent.submit(screen.getByTestId("resolve-dispute-submit"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("order-transition", {
      orderId: "order-1",
      action: "RESOLVE_DISPUTE",
      payload: { finalKg: 24.5 },
    });
    // 폼 안내 문구에도 같은 카피가 있어 성공 메시지 고유 접두어로 조회한다.
    expect(await screen.findByText(/중재 완료 — 무게가 확정되고/)).toBeInTheDocument();
    expect(screen.queryByText(/포인트가 지급/)).not.toBeInTheDocument();
  });

  it("빈/0 이하 finalKg는 호출 없이 검증 에러를 낸다", async () => {
    renderDrawer(makeOrder());
    fireEvent.submit(screen.getByTestId("resolve-dispute-submit"));
    expect(await screen.findByText("확정 kg을 올바르게 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("order-transition 실패 시 서버 메시지를 그대로 표시한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "이미 처리된 주문이에요." });
    renderDrawer(makeOrder());
    fireEvent.change(screen.getByTestId("resolve-dispute-final-kg"), { target: { value: "24" } });
    fireEvent.submit(screen.getByTestId("resolve-dispute-submit"));
    expect(await screen.findByText("이미 처리된 주문이에요.")).toBeInTheDocument();
  });
});

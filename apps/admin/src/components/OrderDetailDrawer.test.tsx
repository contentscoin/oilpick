import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import type { AdminOrderDetail, AdminOrderEvent } from "../hooks/useOrdersAdmin";

/**
 * OrderDetailDrawer 회귀 안전망 (T13).
 * - 분쟁 중재 포인트/kg 표시(03-frontend.md "/orders" DISPUTED)
 * - RESOLVE_DISPUTE 폼 검증(잘못된 finalKg 거부) + 정상 제출 시 order-transition 호출 페이로드
 * - 상태별 폼 노출(DISPUTED만 중재 폼, REQUESTED/ACCEPTED만 취소 폼)
 * - 주문 상태 한글 라벨 표시
 *
 * order-transition 호출은 invokeEdgeFunction 모듈을 모킹해 페이로드만 검증한다(네트워크 미접촉).
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
    snapshotRiderFee: 5000,
    supplierPoint: null,
    ...overrides,
  };
}

const NO_EVENTS: AdminOrderEvent[] = [];

afterEach(() => {
  mockInvoke.mockReset();
});

describe("OrderDetailDrawer", () => {
  it("DISPUTED 주문의 상태 한글 라벨과 계량/이의신청 사유를 표시한다", () => {
    render(
      <OrderDetailDrawer
        order={makeOrder()}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
      />,
    );
    expect(screen.getByText("확인 중")).toBeInTheDocument(); // ORDER_STATUS_LABEL.DISPUTED
    expect(screen.getByText("계량이 너무 적어요")).toBeInTheDocument();
    expect(screen.getByText("22.5kg")).toBeInTheDocument(); // measuredKg
    expect(screen.getByText("30.0kg")).toBeInTheDocument(); // requestedKg
  });

  it("COMPLETED 주문의 지급 포인트를 P 포맷으로 표시한다", () => {
    render(
      <OrderDetailDrawer
        order={makeOrder({ status: "COMPLETED", finalKg: 25, supplierPoint: 22500, disputeReason: null })}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
      />,
    );
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("22,500P")).toBeInTheDocument();
    // COMPLETED에는 분쟁 중재 폼도 취소 폼도 없다.
    expect(screen.queryByTestId("resolve-dispute-submit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cancel-order-button")).not.toBeInTheDocument();
  });

  it("DISPUTED에서 빈/0 이하 finalKg는 order-transition을 호출하지 않고 검증 에러를 낸다", async () => {
    render(
      <OrderDetailDrawer
        order={makeOrder()}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("resolve-dispute-submit"));
    expect(await screen.findByText("확정 kg을 올바르게 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("정상 finalKg 제출 시 RESOLVE_DISPUTE 페이로드로 order-transition을 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    const onMutated = vi.fn();
    render(
      <OrderDetailDrawer
        order={makeOrder()}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={onMutated}
      />,
    );
    fireEvent.change(screen.getByTestId("resolve-dispute-final-kg"), { target: { value: "24.5" } });
    fireEvent.click(screen.getByTestId("resolve-dispute-submit"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("order-transition", {
      orderId: "order-1",
      action: "RESOLVE_DISPUTE",
      payload: { finalKg: 24.5 },
    });
    expect(await screen.findByText("분쟁이 중재되어 포인트가 지급됐어요.")).toBeInTheDocument();
    expect(onMutated).toHaveBeenCalled();
  });

  it("REQUESTED 주문은 취소 폼만 노출하고 CANCEL 페이로드로 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: {} });
    render(
      <OrderDetailDrawer
        order={makeOrder({ status: "REQUESTED", measuredKg: null, disputeReason: null })}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("resolve-dispute-submit")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("cancel-reason-input"), { target: { value: "중복 요청" } });
    fireEvent.click(screen.getByTestId("cancel-order-button"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("order-transition", {
      orderId: "order-1",
      action: "CANCEL",
      payload: { reason: "중복 요청" },
    });
  });

  it("order-transition 실패 시 서버 메시지를 그대로 표시한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "이미 처리된 주문이에요." });
    render(
      <OrderDetailDrawer
        order={makeOrder()}
        events={NO_EVENTS}
        isLoading={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("resolve-dispute-final-kg"), { target: { value: "24" } });
    fireEvent.click(screen.getByTestId("resolve-dispute-submit"));
    expect(await screen.findByText("이미 처리된 주문이에요.")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";
import type { AdminOrderRow } from "../hooks/useOrdersAdmin";

/**
 * OrdersPage 회귀 안전망 (T13).
 * - 상태 필터 클릭이 useAdminOrders에 전달되는지(03-frontend.md "/orders" 상태 필터)
 * - StatusPill의 주문 상태 한글 라벨
 * - kg 표시 분기: 확정(finalKg) / DISPUTED(계량 vs 예상) / 예상(requestedKg)
 *
 * useAdminOrders와 상세 훅들을 모킹해 표시/필터 로직만 검증한다.
 */

const { mockUseAdminOrders, mockUseAdminOrderDetail, mockUseAdminOrderEvents } = vi.hoisted(() => ({
  mockUseAdminOrders: vi.fn(),
  mockUseAdminOrderDetail: vi.fn(),
  mockUseAdminOrderEvents: vi.fn(),
}));

vi.mock("../hooks/useOrdersAdmin", () => ({
  useAdminOrders: (statusFilter: string) => mockUseAdminOrders(statusFilter),
  useAdminOrderDetail: (id: string) => mockUseAdminOrderDetail(id),
  useAdminOrderEvents: (id: string) => mockUseAdminOrderEvents(id),
}));

// OrdersPage가 렌더하는 OrderDetailDrawer가 ../lib/edgeFunction → supabaseClient(env 필요)를
// import하므로, 테스트 환경 env 부재로 인한 모듈 로드 실패를 막기 위해 모킹한다.
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: vi.fn() }));

function order(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: "o-1",
    status: "REQUESTED",
    supplierId: "s-1",
    supplierName: "행복식당",
    riderId: null,
    riderName: null,
    requestedKg: 30,
    measuredKg: null,
    finalKg: null,
    pickupAddress: "서울 강서구",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  mockUseAdminOrders.mockReset();
  mockUseAdminOrderDetail.mockReset();
  mockUseAdminOrderEvents.mockReset();
});

describe("OrdersPage", () => {
  it("상태 필터 버튼을 클릭하면 해당 필터값으로 주문을 조회한다", () => {
    mockUseAdminOrders.mockReturnValue({ data: [], isLoading: false });
    render(<OrdersPage />);
    // 초기 렌더는 ALL로 조회.
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("ALL");

    fireEvent.click(screen.getByTestId("status-filter-DISPUTED"));
    expect(mockUseAdminOrders).toHaveBeenLastCalledWith("DISPUTED");
  });

  it("COMPLETED 주문은 확정 kg을, REQUESTED 주문은 예상 kg을 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [
        order({ id: "done", status: "COMPLETED", finalKg: 25, requestedKg: 30 }),
        order({ id: "req", status: "REQUESTED", requestedKg: 12 }),
      ],
      isLoading: false,
    });
    render(<OrdersPage />);
    expect(screen.getByText("25.0kg (확정)")).toBeInTheDocument();
    expect(screen.getByText("12.0kg (예상)")).toBeInTheDocument();
    // 상태 한글 라벨(StatusPill) — 필터 버튼에도 같은 라벨이 있어 테이블 안으로 스코프한다.
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("완료")).toBeInTheDocument();
    expect(table.getByText("수거 요청됨")).toBeInTheDocument();
  });

  it("DISPUTED 주문은 계량과 예상 kg을 함께 강조 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({
      data: [order({ id: "dsp", status: "DISPUTED", measuredKg: 20, requestedKg: 30, finalKg: null })],
      isLoading: false,
    });
    render(<OrdersPage />);
    expect(screen.getByText("계량 20.0kg / 예상 30.0kg")).toBeInTheDocument();
    const table = within(screen.getByTestId("orders-table"));
    expect(table.getByText("확인 중")).toBeInTheDocument();
  });

  it("주문이 없으면 안내 문구를 표시한다", () => {
    mockUseAdminOrders.mockReturnValue({ data: [], isLoading: false });
    render(<OrdersPage />);
    expect(screen.getByText("해당 상태의 주문이 없어요.")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupportPage } from "./SupportPage";
import type { MyTicket } from "../hooks/useSupport";

const { mockUseSession, mockFrom, mockInsert, mockUseMyTickets, mockUseMyOrderOptions } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockUseMyTickets: vi.fn(),
  mockUseMyOrderOptions: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));
vi.mock("../hooks/useSupport", () => ({
  useMyTickets: (id: string | undefined) => mockUseMyTickets(id),
  useMyOrderOptions: (id: string | undefined) => mockUseMyOrderOptions(id),
  csTicketsKey: (id: string) => ["support", "tickets", id],
}));

function ticket(overrides: Partial<MyTicket> = {}): MyTicket {
  return {
    id: "t-1",
    category: "ORDER",
    orderId: null,
    title: "콜 문의",
    body: "쿠폰이 안 빠졌어요",
    status: "OPEN",
    adminReply: null,
    createdAt: "2026-07-08T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function renderPage(path = "/support") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <SupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SupportPage (rider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
    mockUseMyTickets.mockReturnValue({ data: [] });
    mockUseMyOrderOptions.mockReturnValue({ data: [] });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it("유효한 문의는 role(rider) + 프리셋 주문 연결과 함께 insert한다", async () => {
    // orderId는 실제로는 run.id(uuid) — 프리셋도 uuid여야 csTicketInputSchema를 통과한다.
    const ORDER_UUID = "00000000-0000-0000-0000-000000000009";
    renderPage(`/support?category=CASH_DISPUTE&orderId=${ORDER_UUID}`);
    // CASH_DISPUTE 안내 노출
    expect(screen.getByTestId("support-cash-dispute-note")).toBeInTheDocument();
    expect(screen.getByTestId("support-category")).toHaveValue("CASH_DISPUTE");
    expect(screen.getByTestId("support-order")).toHaveValue(ORDER_UUID);

    fireEvent.change(screen.getByTestId("support-title"), { target: { value: "현금 미수령" } });
    fireEvent.change(screen.getByTestId("support-body"), { target: { value: "사장님이 확인을 안 해줘요" } });
    fireEvent.submit(screen.getByTestId("support-form"));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert).toHaveBeenCalledWith({
      author_id: "rider-1",
      role: "rider",
      category: "CASH_DISPUTE",
      order_id: ORDER_UUID,
      title: "현금 미수령",
      body: "사장님이 확인을 안 해줘요",
    });
  });

  it("빈 입력은 검증 메시지를 보여주고 insert하지 않는다", () => {
    renderPage();
    fireEvent.submit(screen.getByTestId("support-form"));
    expect(screen.getByTestId("support-error")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("내 문의 내역에 상태·답변을 표시한다", () => {
    mockUseMyTickets.mockReturnValue({
      data: [ticket({ id: "t-2", status: "IN_PROGRESS", adminReply: "확인 중이에요" })],
    });
    renderPage();
    expect(screen.getByTestId("support-ticket-status-t-2")).toHaveTextContent("처리 중");
    expect(screen.getByTestId("support-reply-t-2")).toHaveTextContent("확인 중이에요");
  });
});

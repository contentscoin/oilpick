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
    title: "수거 문의",
    body: "언제 오나요?",
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

describe("SupportPage (user)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUseMyTickets.mockReturnValue({ data: [] });
    mockUseMyOrderOptions.mockReturnValue({ data: [] });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it("빈 제목/내용으로 제출하면 검증 메시지를 보여주고 insert하지 않는다", () => {
    renderPage();
    fireEvent.submit(screen.getByTestId("support-form"));
    expect(screen.getByTestId("support-error")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("유효한 문의는 author_id·role(supplier)과 함께 cs_tickets에 insert한다", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("support-title"), { target: { value: "현금 문의" } });
    fireEvent.change(screen.getByTestId("support-body"), { target: { value: "돈을 못 받았어요" } });
    fireEvent.submit(screen.getByTestId("support-form"));

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("cs_tickets"));
    expect(mockInsert).toHaveBeenCalledWith({
      author_id: "user-1",
      role: "supplier",
      category: "ORDER",
      order_id: null,
      title: "현금 문의",
      body: "돈을 못 받았어요",
    });
    expect(await screen.findByTestId("support-success")).toBeInTheDocument();
  });

  it("?category= 쿼리로 카테고리를 프리셋한다", () => {
    renderPage("/support?category=CASH_DISPUTE");
    expect(screen.getByTestId("support-category")).toHaveValue("CASH_DISPUTE");
  });

  it("내 문의 내역에 상태와 답변을 표시한다", () => {
    mockUseMyTickets.mockReturnValue({
      data: [ticket({ id: "t-9", status: "RESOLVED", adminReply: "처리했어요" })],
    });
    renderPage();
    expect(screen.getByTestId("support-ticket-status-t-9")).toHaveTextContent("완료");
    expect(screen.getByTestId("support-reply-t-9")).toHaveTextContent("처리했어요");
  });
});

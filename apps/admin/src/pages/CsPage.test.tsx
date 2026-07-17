import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CsPage } from "./CsPage";
import type { CsTicketRow } from "../hooks/useCsAdmin";

/**
 * CsPage 회귀 안전망 (07 F12 ②).
 * - 상태 필터 큐(OPEN/IN_PROGRESS/RESOLVED)가 useCsTickets에 전달되는지
 * - 상세 드로어: 카테고리/작성자/본문 + 답변 폼 + 상태 전이(cs-reply 호출)
 * - CASH_DISPUTE 안내 + 연결 주문 드로어 링크, COUPON_PAYMENT 환불 연결
 * useCsTickets/invokeEdgeFunction을 모킹해 표시/답변 로직만 검증한다.
 */

const { mockUseCsTickets, mockInvoke, mockNavigate } = vi.hoisted(() => ({
  mockUseCsTickets: vi.fn(),
  mockInvoke: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("../hooks/useCsAdmin", () => ({
  useCsTickets: (statusFilter: string) => mockUseCsTickets(statusFilter),
}));
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function ticket(overrides: Partial<CsTicketRow> = {}): CsTicketRow {
  return {
    id: "t-1",
    authorId: "u-1",
    authorName: "행복식당",
    role: "supplier",
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockUseCsTickets.mockReset();
  mockInvoke.mockReset();
  mockNavigate.mockReset();
});

describe("CsPage", () => {
  it("초기엔 OPEN 큐를 조회하고, 필터 클릭 시 해당 상태로 조회한다", () => {
    mockUseCsTickets.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(mockUseCsTickets).toHaveBeenLastCalledWith("OPEN");

    fireEvent.click(screen.getByTestId("cs-filter-RESOLVED"));
    expect(mockUseCsTickets).toHaveBeenLastCalledWith("RESOLVED");
  });

  it("문의가 없으면 안내 문구를 표시한다", () => {
    mockUseCsTickets.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText("해당 상태의 문의가 없어요.")).toBeInTheDocument();
  });

  it("상세를 열면 본문과 답변 폼을 보여주고, 답변 전송 시 cs-reply를 호출한다", async () => {
    mockUseCsTickets.mockReturnValue({ data: [ticket()], isLoading: false });
    mockInvoke.mockResolvedValue({ ok: true, data: { ticketId: "t-1", status: "RESOLVED" } });
    renderPage();

    fireEvent.click(screen.getByTestId("cs-detail-button-t-1"));
    const drawer = within(screen.getByTestId("cs-drawer"));
    expect(drawer.getByText("언제 오나요?")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("cs-reply-input"), { target: { value: "내일 오전에 방문합니다." } });
    fireEvent.click(screen.getByTestId("cs-status-RESOLVED"));
    fireEvent.click(screen.getByTestId("cs-reply-submit"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cs-reply", {
        ticketId: "t-1",
        reply: "내일 오전에 방문합니다.",
        status: "RESOLVED",
      }),
    );
    expect(await screen.findByText("답변을 등록하고 완료 처리했어요.")).toBeInTheDocument();
  });

  it("빈 답변은 전송하지 않고 검증 메시지를 보여준다", () => {
    mockUseCsTickets.mockReturnValue({ data: [ticket()], isLoading: false });
    renderPage();
    fireEvent.click(screen.getByTestId("cs-detail-button-t-1"));
    fireEvent.click(screen.getByTestId("cs-reply-submit"));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(screen.getByText("답변 내용을 입력해주세요.")).toBeInTheDocument();
  });

  it("CASH_DISPUTE 문의는 처치 안내와 연결 주문 드로어 링크를 보여준다", () => {
    mockUseCsTickets.mockReturnValue({
      data: [ticket({ id: "t-2", category: "CASH_DISPUTE", role: "rider", orderId: "o-9" })],
      isLoading: false,
    });
    renderPage();
    fireEvent.click(screen.getByTestId("cs-detail-button-t-2"));
    expect(screen.getByTestId("cs-cash-dispute-guide")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cs-order-link"));
    expect(mockNavigate).toHaveBeenCalledWith("/orders?order=o-9");
  });

  it("COUPON_PAYMENT 문의는 레거시 안내를 표시한다 (08 P1 — 쿠폰 모델 폐기)", () => {
    mockUseCsTickets.mockReturnValue({
      data: [ticket({ id: "t-3", category: "COUPON_PAYMENT", role: "rider" })],
      isLoading: false,
    });
    renderPage();
    fireEvent.click(screen.getByTestId("cs-detail-button-t-3"));
    expect(screen.getByTestId("cs-coupon-legacy-note")).toHaveTextContent("레거시 문의");
    expect(screen.queryByTestId("cs-coupon-refund-link")).not.toBeInTheDocument();
  });
});

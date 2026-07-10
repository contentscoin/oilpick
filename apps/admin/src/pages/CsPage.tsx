import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  formatRelativeTime,
  type CsStatus,
} from "@oilpick/core";
import { useCsTickets, type CsTicketRow } from "../hooks/useCsAdmin";
import { useEscapeClose, useInitialFocus } from "../hooks/useEscapeClose";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { QueryError } from "../components/QueryError";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "OPEN", label: CS_STATUS_LABEL.OPEN },
  { value: "IN_PROGRESS", label: CS_STATUS_LABEL.IN_PROGRESS },
  { value: "RESOLVED", label: CS_STATUS_LABEL.RESOLVED },
];

const ROLE_LABEL: Record<CsTicketRow["role"], string> = {
  supplier: "점주",
  rider: "라이더",
  admin: "관리자",
};

/**
 * 03-frontend.md apps/admin "/cs" (신설, 07 F12): 문의 티켓 상태 큐 + 답변 폼 + 주문 링크.
 * CASH_DISPUTE(현금 지급 후 분쟁, 07 §1-3)는 OrdersPage 드로어의 FORCE_COMPLETE/귀책 취소로 처치,
 * COUPON_PAYMENT는 매출·정산의 쿠폰 환불로 연결한다. 답변은 cs-reply Edge Function(답변+알림 원자 처리).
 */
export function CsPage() {
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: tickets, isLoading, isError, refetch } = useCsTickets(statusFilter);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && tickets === undefined;

  const selected = (tickets ?? []).find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CS 문의</h1>
        <p className="text-sm text-gray-500">문의를 확인하고 답변해요. 답변 시 작성자에게 알림이 전송돼요.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-white shadow-card"
                : "bg-white text-gray-600 shadow-card hover:bg-gray-50"
            }`}
            data-testid={`cs-filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="cs-table">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">카테고리</th>
              <th className="px-4 py-3 font-medium">작성자</th>
              <th className="px-4 py-3 font-medium">제목</th>
              <th className="px-4 py-3 font-medium">접수</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={6} onRetry={refetch} message="문의 목록을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : tickets && tickets.length > 0 ? (
              tickets.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <CsStatusPill status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <CategoryPill category={t.category} />
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {t.authorName}
                    <span className="ml-1 text-xs text-gray-500">({ROLE_LABEL[t.role]})</span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-gray-700">{t.title}</td>
                  <td className="px-4 py-3 text-gray-500">{formatRelativeTime(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      data-testid={`cs-detail-button-${t.id}`}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  해당 상태의 문의가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {/* 목록은 useCsTickets limit(200) — 상한을 명시해 "전체"로 오독하지 않게 한다. */}
        <p className="border-t border-gray-50 px-4 py-2 text-xs text-gray-500">최근 200건 기준</p>
      </div>

      {selected && <CsTicketDrawer ticket={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function CsStatusPill({ status }: { status: CsStatus }) {
  const color =
    status === "RESOLVED"
      ? "bg-primary-light text-primary"
      : status === "IN_PROGRESS"
        ? "bg-status-active/10 text-status-active"
        : "bg-accent-light text-accent-deep";
  return <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${color}`}>{CS_STATUS_LABEL[status]}</span>;
}

function CategoryPill({ category }: { category: CsTicketRow["category"] }) {
  const danger = category === "CASH_DISPUTE";
  return (
    <span
      className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${
        danger ? "bg-status-danger/10 text-status-danger" : "bg-gray-100 text-gray-600"
      }`}
    >
      {CS_CATEGORY_LABEL[category]}
    </span>
  );
}

function CsTicketDrawer({ ticket, onClose }: { ticket: CsTicketRow; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLDivElement>();
  const [reply, setReply] = useState(ticket.adminReply ?? "");
  const [status, setStatus] = useState<"IN_PROGRESS" | "RESOLVED">(
    ticket.status === "RESOLVED" ? "RESOLVED" : "IN_PROGRESS",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reply.trim();
    if (!trimmed) {
      setError("답변 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("cs-reply", {
      ticketId: ticket.id,
      reply: trimmed,
      status,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(status === "RESOLVED" ? "답변을 등록하고 완료 처리했어요." : "답변을 등록했어요.");
    queryClient.invalidateQueries({ queryKey: ["admin", "cs"] });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      onClick={onClose}
      data-testid="cs-drawer-backdrop"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="문의 상세"
        className="h-full w-full max-w-lg overflow-y-auto bg-surface-app p-6 shadow-raised"
        onClick={(e) => e.stopPropagation()}
        data-testid="cs-drawer"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">문의 상세</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700" data-testid="cs-drawer-close">
            닫기
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-card bg-white p-4 shadow-card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CsStatusPill status={ticket.status} />
              <CategoryPill category={ticket.category} />
              <span className="text-xs text-gray-500">
                {ticket.authorName} ({ROLE_LABEL[ticket.role]}) · {formatRelativeTime(ticket.createdAt)}
              </span>
            </div>
            <p className="text-base font-bold text-gray-900">{ticket.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{ticket.body}</p>
          </section>

          {ticket.orderId && (
            <button
              type="button"
              onClick={() => navigate(`/orders?order=${ticket.orderId}`)}
              className="flex items-center justify-between rounded-card bg-white p-4 text-left shadow-card hover:bg-gray-50"
              data-testid="cs-order-link"
            >
              <span className="text-sm font-medium text-gray-800">연결된 주문 상세 열기</span>
              <span className="text-sm text-primary">주문 드로어 &gt;</span>
            </button>
          )}

          {ticket.category === "CASH_DISPUTE" && (
            <section className="rounded-card border border-status-danger/20 bg-white p-4 shadow-card" data-testid="cs-cash-dispute-guide">
              <p className="mb-1 text-sm font-semibold text-status-danger">현금 지급 후 분쟁 처치 안내</p>
              <p className="text-xs text-gray-600">
                상태머신 밖의 현금 분쟁이에요. 연결 주문의 드로어에서 <b>FORCE_COMPLETE(강제 완결)</b> 또는{" "}
                <b>귀책 취소</b>로 처치할 수 있어요. 답변으로 처리 경과를 안내해 주세요.
              </p>
            </section>
          )}

          {ticket.category === "COUPON_PAYMENT" && (
            <button
              type="button"
              onClick={() => navigate("/settlement")}
              className="flex items-center justify-between rounded-card border border-accent/20 bg-white p-4 text-left shadow-card hover:bg-gray-50"
              data-testid="cs-coupon-refund-link"
            >
              <span className="text-sm font-medium text-gray-800">쿠폰 환불은 매출·정산에서 처리</span>
              <span className="text-sm text-accent-deep">환불 처리 &gt;</span>
            </button>
          )}

          {ticket.adminReply && (
            <section className="rounded-card bg-primary-light p-4 shadow-card">
              <p className="mb-1 text-xs font-medium text-primary">기존 답변</p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{ticket.adminReply}</p>
            </section>
          )}

          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          {message && <p className="text-sm font-medium text-primary">{message}</p>}

          <form onSubmit={handleReply} className="rounded-card bg-white p-4 shadow-card">
            <p className="mb-2 text-sm font-semibold text-gray-800">답변</p>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="답변 내용을 입력해주세요."
              className="mb-3 w-full rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
              data-testid="cs-reply-input"
            />
            <div className="mb-3 flex gap-2" role="radiogroup" aria-label="처리 상태">
              <StatusChoice label="처리 중" value="IN_PROGRESS" current={status} onSelect={setStatus} />
              <StatusChoice label="완료(RESOLVED)" value="RESOLVED" current={status} onSelect={setStatus} />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-button bg-primary text-sm font-semibold text-white shadow-card disabled:opacity-60"
              data-testid="cs-reply-submit"
            >
              답변 전송
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusChoice({
  label,
  value,
  current,
  onSelect,
}: {
  label: string;
  value: "IN_PROGRESS" | "RESOLVED";
  current: string;
  onSelect: (v: "IN_PROGRESS" | "RESOLVED") => void;
}) {
  const active = current === value;
  return (
    <label
      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-button border px-3 py-2 text-sm ${
        active ? "border-primary bg-primary-light text-primary" : "border-gray-200 text-gray-600"
      }`}
    >
      <input
        type="radio"
        name="cs-reply-status"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="sr-only"
        data-testid={`cs-status-${value}`}
      />
      {label}
    </label>
  );
}

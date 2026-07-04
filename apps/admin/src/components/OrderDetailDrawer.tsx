import { useState } from "react";
import { ORDER_STATUS_LABEL, formatKg, formatPoint, formatRelativeTime } from "@oilpick/core";
import type { AdminOrderDetail, AdminOrderEvent } from "../hooks/useOrdersAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";

interface OrderDetailDrawerProps {
  order: AdminOrderDetail | null;
  events: AdminOrderEvent[];
  isLoading: boolean;
  onClose: () => void;
  onMutated: () => void;
}

/**
 * 03-frontend.md apps/admin "/orders": "상세 드로어(이벤트 타임라인, 사진). DISPUTED 건:
 * RESOLVE_DISPUTE 폼(finalKg 입력). CANCEL 버튼". order-transition Edge Function만을 통해
 * 전이한다(CLAUDE.md 절대 규칙 2 — pickup_orders.status 직접 update 금지).
 */
export function OrderDetailDrawer({ order, events, isLoading, onClose, onMutated }: OrderDetailDrawerProps) {
  const [finalKg, setFinalKg] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleResolveDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    const kg = Number(finalKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      setError("확정 kg을 올바르게 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: order.id,
      action: "RESOLVE_DISPUTE",
      payload: { finalKg: kg },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("분쟁이 중재되어 포인트가 지급됐어요.");
    setFinalKg("");
    onMutated();
  }

  async function handleCancel() {
    if (!order) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await invokeEdgeFunction("order-transition", {
      orderId: order.id,
      action: "CANCEL",
      payload: { reason: cancelReason || "관리자 취소" },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("주문이 취소되었어요.");
    onMutated();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose} data-testid="order-drawer-backdrop">
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="order-drawer"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">주문 상세</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-700" data-testid="order-drawer-close">
            닫기
          </button>
        </div>

        {isLoading || !order ? (
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        ) : (
          <div className="flex flex-col gap-5">
            <section>
              <p className="text-xs font-medium text-zinc-400">상태</p>
              <p className="text-base font-semibold text-zinc-900">{ORDER_STATUS_LABEL[order.status]}</p>
            </section>

            <section className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400">공급업체</p>
                <p className="font-medium text-zinc-800">{order.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">라이더</p>
                <p className="font-medium text-zinc-800">{order.riderName ?? "미배정"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">예상 kg</p>
                <p className="font-medium tabular-nums text-zinc-800">{formatKg(order.requestedKg)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">계량 kg</p>
                <p className="font-medium tabular-nums text-zinc-800">
                  {order.measuredKg !== null ? formatKg(order.measuredKg) : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">확정 kg</p>
                <p className="font-medium tabular-nums text-zinc-800">
                  {order.finalKg !== null ? formatKg(order.finalKg) : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">지급 포인트</p>
                <p className="font-medium tabular-nums text-primary">
                  {order.supplierPoint !== null ? formatPoint(order.supplierPoint) : "-"}
                </p>
              </div>
            </section>

            <section>
              <p className="text-xs text-zinc-400">수거 주소</p>
              <p className="text-sm text-zinc-700">{order.pickupAddress}</p>
            </section>

            {order.disputeReason && (
              <section className="rounded-xl bg-accent-light p-3">
                <p className="text-xs font-medium text-accent">이의신청 사유</p>
                <p className="text-sm text-zinc-800">{order.disputeReason}</p>
              </section>
            )}
            {order.cancelReason && (
              <section className="rounded-xl bg-zinc-100 p-3">
                <p className="text-xs font-medium text-zinc-500">취소 사유</p>
                <p className="text-sm text-zinc-800">{order.cancelReason}</p>
              </section>
            )}

            {order.photoUrls.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-medium text-zinc-400">계량 사진</p>
                <div className="flex flex-wrap gap-2">
                  {order.photoUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="계량 사진"
                      className="h-24 w-24 rounded-xl border border-zinc-100 object-cover"
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <p className="mb-2 text-xs font-medium text-zinc-400">이벤트 타임라인</p>
              <ol className="flex flex-col gap-2" data-testid="order-event-timeline">
                {events.map((ev) => (
                  <li key={ev.id} className="rounded-xl border border-zinc-100 px-3 py-2 text-sm">
                    <p className="font-medium text-zinc-800">
                      {ev.fromStatus ? ORDER_STATUS_LABEL[ev.fromStatus as keyof typeof ORDER_STATUS_LABEL] : "생성"} →{" "}
                      {ORDER_STATUS_LABEL[ev.toStatus as keyof typeof ORDER_STATUS_LABEL]}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {ev.actorId ? `actor: ${ev.actorId.slice(0, 8)}` : "시스템"} · {formatRelativeTime(ev.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
            {message && <p className="text-sm font-medium text-primary">{message}</p>}

            {order.status === "DISPUTED" && (
              <form onSubmit={handleResolveDispute} className="rounded-xl border border-zinc-200 p-4">
                <p className="mb-2 text-sm font-semibold text-zinc-800">분쟁 중재</p>
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs text-zinc-500">확정 kg</span>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={finalKg}
                    onChange={(e) => setFinalKg(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-primary"
                    data-testid="resolve-dispute-final-kg"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="resolve-dispute-submit"
                >
                  중재 확정
                </button>
              </form>
            )}

            {(order.status === "REQUESTED" || order.status === "ACCEPTED") && (
              <div className="rounded-xl border border-status-danger/30 p-4">
                <p className="mb-2 text-sm font-semibold text-status-danger">주문 취소</p>
                <input
                  type="text"
                  placeholder="취소 사유(선택)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-status-danger"
                  data-testid="cancel-reason-input"
                />
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="h-10 w-full rounded-lg bg-status-danger text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="cancel-order-button"
                >
                  주문 취소
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

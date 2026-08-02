import { useState } from "react";
import { ARRIVED_STALE_MS, ORDER_STATUS_LABEL } from "@oilpick/core";
import {
  useDealerActiveOrders,
  useMyRiders,
  useMyRiderStats,
  useDealerScopeMutations,
  type DealerActiveOrder,
  type DealerRiderRow,
} from "../hooks/useDealerScope";

/**
 * [16 L9 §6-1] 라이더 관리 액션 다이얼로그 — rider-verify가 이미 지원하는 4-decision
 * (APPROVED/REJECTED/SUSPENDED/REINSTATED)의 UI 완성. 서버·훅 변경 0(권한 확대 없음).
 * 반려·정지는 사유 필수(서버도 강제), 파괴적 액션(반려·정지·소속 해제)은 확인을 거친다.
 */
type RiderActionType = "reject" | "suspend" | "unassign";

interface RiderActionState {
  type: RiderActionType;
  rider: DealerRiderRow;
}

const ACTION_COPY: Record<RiderActionType, { title: string; confirm: string; needsReason: boolean; message: (name: string) => string }> = {
  reject: {
    title: "서류 반려",
    confirm: "반려",
    needsReason: true,
    message: (name) => `${name} 라이더의 서류를 반려해요. 사유는 라이더에게 전달돼요.`,
  },
  suspend: {
    title: "라이더 정지",
    confirm: "정지",
    needsReason: true,
    message: (name) => `${name} 라이더를 정지해요. 정지 중에는 콜을 받을 수 없어요.`,
  },
  unassign: {
    title: "소속 해제",
    confirm: "해제",
    needsReason: false,
    message: (name) => `${name} 라이더를 내 소속에서 해제해요. 미배정(본사 직속)으로 돌아가요.`,
  },
};

/**
 * 13 I4【dealer】 관할 대시보드 — 요약 KPI + 소속 라이더 목록 + 승인/해제.
 * [16 L6] '진행중 운행' 관제 섹션 추가 — v_dealer_active_orders(조회 전용, 상태 액션 없음 —
 * 13 D3 불변) + 확인 지연 배지(arrived_at 24h, admin 하이라이트와 동일 기준) + 라이더 전화 CTA.
 */
export function DealerHomePage() {
  const { data: riders, isLoading } = useMyRiders();
  const { data: stats } = useMyRiderStats();
  const { data: activeOrders } = useDealerActiveOrders();
  const { verifyRider, unassign } = useDealerScopeMutations();

  const total = riders?.length ?? 0;
  const approved = riders?.filter((r) => r.verifyStatus === "APPROVED").length ?? 0;
  const pending = riders?.filter((r) => r.verifyStatus === "PENDING").length ?? 0;
  const collectedKg = (stats ?? []).reduce((s, r) => s + Number(r.collected_kg), 0);
  // [16 L6] 라이더 전화 CTA — 현 소속 라이더의 연락처(useMyRiders — p_profiles_read_own_riders).
  // 전 소속(재배정) 라이더는 맵에 없어 CTA 미렌더(PII 최소화, 뷰 표시명 폴백과 동일 원칙).
  const riderPhones = new Map((riders ?? []).map((r) => [r.id, r.phone]));

  // [16 L9] 파괴적 액션(반려·정지·해제) 확인 다이얼로그 + 사유 입력.
  const [action, setAction] = useState<RiderActionState | null>(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  function openAction(type: RiderActionType, rider: DealerRiderRow) {
    setAction({ type, rider });
    setReason("");
  }

  async function confirmAction() {
    if (!action) return;
    const copy = ACTION_COPY[action.type];
    if (copy.needsReason && reason.trim() === "") return; // 버튼 disabled와 이중 방어
    setActionBusy(true);
    if (action.type === "reject") await verifyRider(action.rider.id, "REJECTED", reason.trim());
    else if (action.type === "suspend") await verifyRider(action.rider.id, "SUSPENDED", reason.trim());
    else await unassign(action.rider.id);
    setActionBusy(false);
    setAction(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">관할 대시보드</h1>
        <p className="text-sm text-gray-500">내 소속 라이더 현황과 실적을 한눈에 확인해요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="dealer-kpi">
        <Kpi label="소속 라이더" value={`${total}명`} />
        <Kpi label="승인 완료" value={`${approved}명`} />
        <Kpi label="승인 대기" value={`${pending}명`} accent />
        <Kpi label="누적 수거" value={`${collectedKg.toFixed(1)}kg`} />
      </div>

      {/* [16 L6] 진행중 운행 관제 — 감지(지연 배지)→개입(전화)이 화면 안에서 닫힌다. */}
      <div className="rounded-card bg-white p-6 shadow-card" data-testid="dealer-active-orders">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">진행중 운행</h2>
        <p className="mb-4 text-xs text-gray-500">
          소속 라이더가 배정된 진행중 주문이에요. 상태 변경은 라이더·점주·본사만 할 수 있어요.
        </p>
        {activeOrders && activeOrders.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {activeOrders.map((o) => (
              <ActiveOrderRow key={o.orderId} order={o} phone={o.riderId ? (riderPhones.get(o.riderId) ?? null) : null} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500" data-testid="dealer-active-empty">
            지금 진행중인 운행이 없어요.
          </p>
        )}
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">소속 라이더</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : riders && riders.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="dealer-rider-list">
            {riders.map((r) => (
              <li
                key={r.id}
                data-testid={`dealer-rider-${r.id}`}
                className="flex flex-col gap-2 rounded-card border border-gray-100 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {r.name}
                    {r.isOnline && <span className="ml-2 rounded-pill bg-primary-light px-2 py-0.5 text-xs text-primary">온라인</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.verifyStatus} · {r.phone ?? "연락처 없음"}
                  </p>
                </div>
                {/* [16 L9] verify_status별 4-decision 액션 — 서버(rider-verify)가 이미 허용하는
                    액션의 노출뿐(전이 유효성은 Edge/guard가 최종 판정). 파괴적 액션은 다이얼로그. */}
                <div className="flex gap-2">
                  {r.verifyStatus === "PENDING" && (
                    <>
                      <button
                        type="button"
                        data-testid={`approve-${r.id}`}
                        onClick={() => verifyRider(r.id, "APPROVED")}
                        className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        data-testid={`reject-${r.id}`}
                        onClick={() => openAction("reject", r)}
                        className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        반려
                      </button>
                    </>
                  )}
                  {r.verifyStatus === "APPROVED" && (
                    <button
                      type="button"
                      data-testid={`suspend-${r.id}`}
                      onClick={() => openAction("suspend", r)}
                      className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      정지
                    </button>
                  )}
                  {r.verifyStatus === "SUSPENDED" && (
                    <button
                      type="button"
                      data-testid={`reinstate-${r.id}`}
                      onClick={() => verifyRider(r.id, "REINSTATED")}
                      className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card"
                    >
                      정지 해제
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`unassign-${r.id}`}
                    onClick={() => openAction("unassign", r)}
                    className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
                  >
                    소속 해제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">소속 라이더가 없어요. 본사에 배정을 요청하거나 라이더를 모집해 배정하세요.</p>
        )}
      </div>

      {/* [16 L9] 확인 다이얼로그 — 대상 라이더명·결과 명시, 반려·정지는 사유 필수(오탭 방지). */}
      {action && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="rider-action-dialog"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-card bg-white p-6 shadow-card">
            <h3 className="text-lg font-semibold text-gray-900">{ACTION_COPY[action.type].title}</h3>
            <p className="mt-2 text-sm text-gray-600">{ACTION_COPY[action.type].message(action.rider.name)}</p>
            {ACTION_COPY[action.type].needsReason && (
              <textarea
                data-testid="rider-action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="사유를 입력하세요 (라이더에게 전달돼요)"
                rows={3}
                className="mt-3 w-full rounded-button border border-gray-200 p-2 text-sm"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-testid="rider-action-cancel"
                onClick={() => setAction(null)}
                className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="rider-action-confirm"
                disabled={actionBusy || (ACTION_COPY[action.type].needsReason && reason.trim() === "")}
                onClick={() => void confirmAction()}
                className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card disabled:opacity-50"
              >
                {ACTION_COPY[action.type].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** [16 L6] 진행중 운행 행 — 상태 pill + 지연 배지 + 라이더 전화. 조회 전용(액션 없음). */
function ActiveOrderRow({ order, phone }: { order: DealerActiveOrder; phone: string | null }) {
  // 확인 지연: ARRIVED로 24시간 초과 체류(admin OrdersPage 하이라이트와 동일 기준 ARRIVED_STALE_MS).
  const stale =
    order.status === "ARRIVED" &&
    order.arrivedAt != null &&
    Date.now() - new Date(order.arrivedAt).getTime() > ARRIVED_STALE_MS;
  const statusClass =
    order.status === "DISPUTED"
      ? "bg-red-50 text-red-600"
      : order.status === "ARRIVED"
        ? "bg-amber-50 text-amber-700"
        : "bg-primary-light text-primary";
  return (
    <li
      data-testid={`dealer-active-${order.orderId}`}
      className="flex flex-col gap-2 rounded-card border border-gray-100 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium text-gray-800">
          <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          {order.riderName}
          {stale && (
            <span
              data-testid={`dealer-active-stale-${order.orderId}`}
              className="rounded-pill bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600"
            >
              확인 지연
            </span>
          )}
        </p>
        <p className="truncate text-xs text-gray-500">
          {order.pickupAddress}
          {(order.purchaseRequestedCans ?? 0) > 0 && ` · 신유 ${order.purchaseRequestedCans}캔`}
        </p>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          data-testid={`dealer-active-call-${order.orderId}`}
          className="shrink-0 rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          라이더에게 전화
        </a>
      )}
    </li>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

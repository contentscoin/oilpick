import { ARRIVED_STALE_MS, ORDER_STATUS_LABEL } from "@oilpick/core";
import {
  useDealerActiveOrders,
  useMyRiders,
  useMyRiderStats,
  useDealerScopeMutations,
  type DealerActiveOrder,
} from "../hooks/useDealerScope";

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
                <div className="flex gap-2">
                  {r.verifyStatus === "PENDING" && (
                    <button
                      type="button"
                      data-testid={`approve-${r.id}`}
                      onClick={() => verifyRider(r.id, "APPROVED")}
                      className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card"
                    >
                      승인
                    </button>
                  )}
                  {r.verifyStatus === "APPROVED" && (
                    <button
                      type="button"
                      data-testid={`suspend-${r.id}`}
                      onClick={() => verifyRider(r.id, "SUSPENDED", "좌상 정지")}
                      className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      정지
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`unassign-${r.id}`}
                    onClick={() => unassign(r.id)}
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

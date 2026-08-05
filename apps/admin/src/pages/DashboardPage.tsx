import { MapView, type MapMarker } from "@oilpick/ui";
import { ORDER_STATUS_LABEL, formatKrw, formatPoint, type OrderStatus } from "@oilpick/core";
import { MAP_STYLE_URL } from "../lib/env";
import { useDashboardKpi, useDashboardOrders, useDashboardRiders } from "../hooks/useDashboard";
import { OrderStatusPill } from "../components/OrderStatusPill";
import { QueryError } from "../components/QueryError";

const SEOUL_CENTER = { lat: 37.5509, lng: 126.8225 }; // 집하장 인근(seed.sql) 기본 중심.

function KpiCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/**
 * 03-frontend.md apps/admin "/" + 07 F10-④ KPI 개정: "카카오맵 전체 지도(진행중 주문 핀 +
 * 온라인 라이더 핀, Realtime) + 오늘 KPI(주문수/수거kg/쿠폰 판매액/소진 쿠폰/활성 라이더/
 * 현금 거래액 — 포인트 카드 제거)". 04-tasks.md T11 지시사항:
 * "packages/ui MapView 재사용, 리스트 형태 보조 표시도 병행해도 됨".
 * 타일(VITE_MAP_STYLE_URL)이 없는 이 개발 환경에서는 MapView가 placeholder를 렌더하므로, 핀 정보를 확인할 수
 * 있도록 리스트를 항상 병행 표시한다.
 */
export function DashboardPage() {
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useDashboardOrders();
  const {
    data: riders,
    isLoading: ridersLoading,
    isError: ridersError,
    refetch: refetchRiders,
  } = useDashboardRiders();
  // 초기 로드 실패만 에러 UI로 — 15s 폴링/Realtime refetch의 일시 실패가 보이던 리스트(및 지도 핀과의
  // 일관성)를 지우지 않게 한다. TanStack v5는 error 상태에서도 data를 보존한다.
  const ordersLoadFailed = ordersError && orders === undefined;
  const ridersLoadFailed = ridersError && riders === undefined;
  const { data: kpi, isLoading: kpiLoading, isError: kpiError, refetch: refetchKpi } = useDashboardKpi();
  // KPI도 동일 — 실패를 "0건/0원"으로 위장하지 않는다(운영자가 장애를 실적 0으로 오독하는 화면).
  const kpiLoadFailed = kpiError && kpi === undefined;

  const orderMarkers: MapMarker[] = (orders ?? []).map((o) => ({
    lat: o.lat,
    lng: o.lng,
    label: `주문 ${ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}`,
  }));
  const riderMarkers: MapMarker[] = (riders ?? []).map((r) => ({ lat: r.lat, lng: r.lng, label: "라이더" }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500">오늘의 현황과 진행 중인 주문을 한눈에 확인해요.</p>
      </div>

      {/* 08 G7-② KPI 교체: 쿠폰 판매액/소진 쿠폰 제거(쿠폰 모델 폐기) → 현금/포인트 지급 분리 + 출금 대기. */}
      {kpiLoadFailed ? (
        <div className="rounded-card bg-white p-5 shadow-card">
          <QueryError onRetry={refetchKpi} message="오늘 지표를 불러오지 못했어요" />
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="오늘 주문 수" value={kpiLoading ? "-" : `${kpi?.orderCount ?? 0}건`} />
        <KpiCard label="오늘 수거 kg" value={kpiLoading ? "-" : `${(kpi?.collectedKg ?? 0).toFixed(1)}kg`} />
        <KpiCard label="오늘 현금 지급" value={kpiLoading ? "-" : formatKrw(kpi?.cashPaidAmount ?? 0)} accent />
        <KpiCard label="오늘 포인트 지급" value={kpiLoading ? "-" : formatPoint(kpi?.pointPaidAmount ?? 0)} accent />
        <KpiCard label="출금 대기" value={kpiLoading ? "-" : `${kpi?.pendingWithdrawals ?? 0}건`} />
        <KpiCard label="활성 라이더" value={kpiLoading ? "-" : `${kpi?.activeRiderCount ?? 0}명`} />
      </div>
      )}

      <div className="rounded-card bg-white p-5 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">실시간 지도</h2>
        <MapView
          styleUrl={MAP_STYLE_URL}
          center={SEOUL_CENTER}
          markers={[...orderMarkers, ...riderMarkers]}
          level={7}
          style={{ minHeight: 360 }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-5 shadow-card">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            진행 중인 주문 ({orders?.length ?? 0}건)
          </h2>
          {ordersLoadFailed ? (
            <QueryError onRetry={refetchOrders} message="진행 중인 주문을 불러오지 못했어요" />
          ) : ordersLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : orders && orders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-order-list">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-card border border-gray-100 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800">{o.pickupAddress}</p>
                    <p className="text-xs text-gray-500">{o.requestedKg}kg 예상</p>
                  </div>
                  <span className="shrink-0">
                    <OrderStatusPill status={o.status as OrderStatus} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">진행 중인 주문이 없어요.</p>
          )}
        </div>

        <div className="rounded-card bg-white p-5 shadow-card">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            온라인 라이더 ({riders?.length ?? 0}명)
          </h2>
          {ridersLoadFailed ? (
            <QueryError onRetry={refetchRiders} message="온라인 라이더를 불러오지 못했어요" />
          ) : ridersLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : riders && riders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-rider-list">
              {riders.map((r) => (
                <li key={r.id} className="rounded-card border border-gray-100 px-3 py-2 text-sm text-gray-700">
                  라이더 {r.id.slice(0, 8)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">온라인 라이더가 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

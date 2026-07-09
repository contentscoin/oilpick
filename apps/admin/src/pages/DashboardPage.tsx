import { MapView, type MapMarker } from "@oilpick/ui";
import { ORDER_STATUS_LABEL, formatKrw } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { useDashboardKpi, useDashboardOrders, useDashboardRiders } from "../hooks/useDashboard";

const SEOUL_CENTER = { lat: 37.5509, lng: 126.8225 }; // 집하장 인근(seed.sql) 기본 중심.

function KpiCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${accent ? "text-accent" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/**
 * 03-frontend.md apps/admin "/" + 07 F10-④ KPI 개정: "카카오맵 전체 지도(진행중 주문 핀 +
 * 온라인 라이더 핀, Realtime) + 오늘 KPI(주문수/수거kg/쿠폰 판매액/소진 쿠폰/활성 라이더/
 * 현금 거래액 — 포인트 카드 제거)". 04-tasks.md T11 지시사항:
 * "카카오키 없으니 packages/ui MapView 재사용, 리스트 형태 보조 표시도 병행해도 됨".
 * 카카오 키가 없는 이 개발 환경에서는 MapView가 placeholder를 렌더하므로, 핀 정보를 확인할 수
 * 있도록 리스트를 항상 병행 표시한다.
 */
export function DashboardPage() {
  const { data: orders, isLoading: ordersLoading } = useDashboardOrders();
  const { data: riders, isLoading: ridersLoading } = useDashboardRiders();
  const { data: kpi, isLoading: kpiLoading } = useDashboardKpi();

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

      {/* 07 F10-④ KPI 교체: "오늘 발행 포인트" 제거(D1), 쿠폰 판매액/소진 쿠폰/현금 거래액 추가. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="오늘 주문 수" value={kpiLoading ? "-" : `${kpi?.orderCount ?? 0}건`} />
        <KpiCard label="오늘 수거 kg" value={kpiLoading ? "-" : `${(kpi?.collectedKg ?? 0).toFixed(1)}kg`} />
        <KpiCard
          label="오늘 쿠폰 판매액"
          value={kpiLoading ? "-" : formatKrw(kpi?.couponSalesAmount ?? 0)}
          accent
        />
        <KpiCard label="오늘 소진 쿠폰" value={kpiLoading ? "-" : `${kpi?.consumedCoupons ?? 0}장`} />
        <KpiCard label="활성 라이더" value={kpiLoading ? "-" : `${kpi?.activeRiderCount ?? 0}명`} />
        <KpiCard label="오늘 현금 거래액" value={kpiLoading ? "-" : formatKrw(kpi?.cashPaidAmount ?? 0)} />
      </div>

      <div className="rounded-card bg-white p-5 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">실시간 지도</h2>
        <MapView
          apiKey={KAKAO_KEY}
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
          {ordersLoading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : orders && orders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-order-list">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-card border border-gray-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-800">{o.pickupAddress}</p>
                    <p className="text-xs text-gray-500">{o.requestedKg}kg 예상</p>
                  </div>
                  <span className="rounded-pill bg-primary-light px-2 py-1 text-xs font-semibold text-primary">
                    {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">진행 중인 주문이 없어요.</p>
          )}
        </div>

        <div className="rounded-card bg-white p-5 shadow-card">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            온라인 라이더 ({riders?.length ?? 0}명)
          </h2>
          {ridersLoading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : riders && riders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-rider-list">
              {riders.map((r) => (
                <li key={r.id} className="rounded-card border border-gray-100 px-3 py-2 text-sm text-gray-700">
                  라이더 {r.id.slice(0, 8)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">온라인 라이더가 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

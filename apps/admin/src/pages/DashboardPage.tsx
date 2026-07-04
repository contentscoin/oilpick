import { MapView, type MapMarker } from "@oilpick/ui";
import { ORDER_STATUS_LABEL } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { useDashboardKpi, useDashboardOrders, useDashboardRiders } from "../hooks/useDashboard";

const SEOUL_CENTER = { lat: 37.5509, lng: 126.8225 }; // 집하장 인근(seed.sql) 기본 중심.

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900">{value}</p>
    </div>
  );
}

/**
 * 03-frontend.md apps/admin "/": "카카오맵 전체 지도(진행중 주문 핀 + 온라인 라이더 핀,
 * Realtime) + 오늘 KPI 카드 4개(주문수/수거kg/발행P/활성 라이더)". 04-tasks.md T11 지시사항:
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
        <h1 className="text-2xl font-bold text-zinc-900">대시보드</h1>
        <p className="text-sm text-zinc-500">오늘의 현황과 진행 중인 주문을 한눈에 확인해요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="오늘 주문 수" value={kpiLoading ? "-" : `${kpi?.orderCount ?? 0}건`} />
        <KpiCard label="오늘 수거 kg" value={kpiLoading ? "-" : `${(kpi?.collectedKg ?? 0).toFixed(1)}kg`} />
        <KpiCard
          label="오늘 발행 포인트"
          value={kpiLoading ? "-" : `${(kpi?.issuedPoint ?? 0).toLocaleString("ko-KR")}P`}
        />
        <KpiCard label="활성 라이더" value={kpiLoading ? "-" : `${kpi?.activeRiderCount ?? 0}명`} />
      </div>

      <div className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">실시간 지도</h2>
        <MapView
          apiKey={KAKAO_KEY}
          center={SEOUL_CENTER}
          markers={[...orderMarkers, ...riderMarkers]}
          level={7}
          style={{ minHeight: 360 }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            진행 중인 주문 ({orders?.length ?? 0}건)
          </h2>
          {ordersLoading ? (
            <p className="text-sm text-zinc-400">불러오는 중...</p>
          ) : orders && orders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-order-list">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-800">{o.pickupAddress}</p>
                    <p className="text-xs text-zinc-500">{o.requestedKg}kg 예상</p>
                  </div>
                  <span className="rounded-full bg-primary-light px-2 py-1 text-xs font-semibold text-primary">
                    {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">진행 중인 주문이 없어요.</p>
          )}
        </div>

        <div className="rounded-card bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            온라인 라이더 ({riders?.length ?? 0}명)
          </h2>
          {ridersLoading ? (
            <p className="text-sm text-zinc-400">불러오는 중...</p>
          ) : riders && riders.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="dashboard-rider-list">
              {riders.map((r) => (
                <li key={r.id} className="rounded-xl border border-zinc-100 px-3 py-2 text-sm text-zinc-700">
                  라이더 {r.id.slice(0, 8)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">온라인 라이더가 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

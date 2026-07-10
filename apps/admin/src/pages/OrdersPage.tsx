import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ORDER_STATUS_LABEL, formatKg } from "@oilpick/core";
import { useAdminOrderDetail, useAdminOrderEvents, useAdminOrders } from "../hooks/useOrdersAdmin";
import { OrderDetailDrawer } from "../components/OrderDetailDrawer";
import { OrderStatusPill } from "../components/OrderStatusPill";
import { QueryError } from "../components/QueryError";
import { isArrivedStale } from "../lib/arrivedStale";
import { downloadCsv, toCsv } from "../lib/csv";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "REQUESTED", label: ORDER_STATUS_LABEL.REQUESTED },
  { value: "ACCEPTED", label: ORDER_STATUS_LABEL.ACCEPTED },
  { value: "ARRIVED", label: ORDER_STATUS_LABEL.ARRIVED },
  { value: "PICKED_UP", label: ORDER_STATUS_LABEL.PICKED_UP },
  { value: "DELIVERED", label: ORDER_STATUS_LABEL.DELIVERED },
  { value: "COMPLETED", label: ORDER_STATUS_LABEL.COMPLETED },
  { value: "DISPUTED", label: ORDER_STATUS_LABEL.DISPUTED },
  { value: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

/**
 * 03-frontend.md apps/admin "/orders": "테이블(상태 필터) → 상세 드로어(이벤트 타임라인, 사진).
 * DISPUTED 건: RESOLVE_DISPUTE 폼(finalKg 입력). CANCEL 버튼".
 * 07 F10-⑤·⑥: 드로어에 쿠폰/현금/귀책 취소/FORCE_COMPLETE(OrderDetailDrawer 참조), 주문 CSV 내보내기.
 * 06 E10-①: 텍스트 검색(주소/공급업체 상호/라이더 차량번호) + created_at 날짜 범위 필터.
 */
export function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  // 06 E10-①: 날짜 범위(YYYY-MM-DD, 빈 문자열=미적용)는 서버 쿼리로 필터(useAdminOrders 참조).
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data: orders, isLoading, isError, refetch } = useAdminOrders(statusFilter, dateFrom, dateTo);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && orders === undefined;

  // 06 E10-①: 텍스트 검색은 클라이언트 필터(소문자 includes) — 상호/차량번호는 fetchNameMaps가
  // 클라이언트에서 join한 값이라 서버 ilike로는 검색할 수 없다(DoD: RLS/뷰 변경 없음).
  const keyword = searchText.trim().toLowerCase();
  const filteredOrders = (orders ?? []).filter(
    (o) =>
      !keyword ||
      [o.pickupAddress, o.supplierName, o.riderName ?? ""].some((v) => v.toLowerCase().includes(keyword)),
  );

  // 07 F12 ②: CS 페이지의 "연결 주문 드로어 열기"가 /orders?order=<id>로 진입하면 해당 드로어를 연다.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const orderParam = searchParams.get("order");
    if (orderParam) {
      setSelectedOrderId(orderParam);
      searchParams.delete("order");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 06 E10-①: 검색/상태/날짜 필터가 반영된 목록(filteredOrders) 기준으로 내보낸다.
  function handleCsv() {
    const csv = toCsv(
      ["주문ID", "상태", "공급업체", "라이더", "예상kg", "계량kg", "확정kg", "주소", "생성일"],
      filteredOrders.map((o) => [
        o.id,
        ORDER_STATUS_LABEL[o.status] ?? o.status,
        o.supplierName,
        o.riderName,
        o.requestedKg,
        o.measuredKg,
        o.finalKg,
        o.pickupAddress,
        new Date(o.createdAt).toLocaleString("ko-KR"),
      ]),
    );
    downloadCsv(`주문_${statusFilter}`, csv);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">주문 관리</h1>
          <p className="text-sm text-gray-500">주문 상태를 확인하고 분쟁을 중재해요.</p>
        </div>
        <button
          type="button"
          onClick={handleCsv}
          className="h-8 rounded-button border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
          data-testid="orders-csv-button"
        >
          CSV
        </button>
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
            data-testid={`status-filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 06 E10-①: 텍스트 검색 + created_at 날짜 범위 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="주소·공급업체·라이더 차량번호 검색"
          className="h-9 w-72 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary"
          data-testid="orders-search-input"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="시작일"
          className="h-9 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary"
          data-testid="orders-date-from"
        />
        <span className="text-sm text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="종료일"
          className="h-9 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary"
          data-testid="orders-date-to"
        />
      </div>

      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="orders-table">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">공급업체</th>
              <th className="px-4 py-3 font-medium">라이더</th>
              <th className="px-4 py-3 font-medium">예상/확정 kg</th>
              <th className="px-4 py-3 font-medium">주소</th>
              <th className="px-4 py-3 font-medium">생성일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={7} onRetry={refetch} message="주문 목록을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : filteredOrders.length > 0 ? (
              filteredOrders.map((o) => {
                const stale = isArrivedStale(o.status, o.arrivedAt);
                return (
                <tr
                  key={o.id}
                  className={`border-b border-gray-50 transition-colors ${
                    stale ? "bg-status-danger/5 hover:bg-status-danger/10" : "hover:bg-gray-50"
                  }`}
                  data-testid={stale ? `order-row-stale-${o.id}` : undefined}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <OrderStatusPill status={o.status} />
                      {stale && (
                        <span
                          className="rounded-pill bg-status-danger/10 px-2 py-0.5 text-xs font-semibold text-status-danger"
                          data-testid={`arrived-stale-badge-${o.id}`}
                          title="현장 도착 후 24시간 초과 체류 — 교착 가능성"
                        >
                          24h+ 체류
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{o.supplierName}</td>
                  <td className="px-4 py-3 text-gray-800">{o.riderName ?? "-"}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-800">
                    {o.finalKg !== null ? (
                      `${formatKg(o.finalKg)} (확정)`
                    ) : o.status === "DISPUTED" && o.measuredKg !== null ? (
                      <span className="font-medium text-status-danger">
                        계량 {formatKg(o.measuredKg)} / 예상 {formatKg(o.requestedKg)}
                      </span>
                    ) : (
                      `${formatKg(o.requestedKg)} (예상)`
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-gray-600">{o.pickupAddress}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(o.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(o.id)}
                      className="rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      data-testid={`order-detail-button-${o.id}`}
                    >
                      상세
                    </button>
                  </td>
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  조건에 맞는 주문이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {/* 목록은 useAdminOrders limit(200) — 상한을 명시해 "전체"로 오독하지 않게 한다. */}
        <p className="border-t border-gray-50 px-4 py-2 text-xs text-gray-500">최근 200건 기준</p>
      </div>

      {selectedOrderId && (
        <OrderDetailDrawerContainer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
  );
}

function OrderDetailDrawerContainer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: order, isLoading, refetch } = useAdminOrderDetail(orderId);
  const { data: events } = useAdminOrderEvents(orderId);

  return (
    <OrderDetailDrawer
      order={order ?? null}
      events={events ?? []}
      isLoading={isLoading}
      onClose={onClose}
      onMutated={refetch}
    />
  );
}

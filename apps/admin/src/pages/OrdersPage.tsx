import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ORDER_STATUS_LABEL, formatKg } from "@oilpick/core";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  DEFAULT_ADMIN_ORDERS_SORT,
  useAdminOrderDetail,
  useAdminOrderEvents,
  useAdminOrders,
} from "../hooks/useOrdersAdmin";
import type { AdminOrdersSort, AdminOrdersSortColumn } from "../hooks/useOrdersAdmin";
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
 * 05 폴리시 패스: 서버 페이지네이션(50건, 이전/다음) + 컬럼 정렬(요청일/예상 kg).
 */
export function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  // 06 E10-①: 날짜 범위(YYYY-MM-DD, 빈 문자열=미적용)는 서버 쿼리로 필터(useAdminOrders 참조).
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // 05 폴리시 패스: 필터(status/date/검색)·정렬 변경 시 page는 0으로 리셋한다(아래 핸들러).
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<AdminOrdersSort>(DEFAULT_ADMIN_ORDERS_SORT);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useAdminOrders(statusFilter, dateFrom, dateTo, page, sort);
  const orders = data?.rows;
  const hasNextPage = data?.hasNextPage ?? false;
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && data === undefined;

  // 06 E10-①: 텍스트 검색은 클라이언트 필터(소문자 includes) — 상호/차량번호는 fetchNameMaps가
  // 클라이언트에서 join한 값이라 서버 ilike로는 검색할 수 없다(DoD: RLS/뷰 변경 없음).
  // 페이지네이션 도입 후에도 검색 범위는 현재 페이지 rows다.
  const keyword = searchText.trim().toLowerCase();
  const filteredOrders = (orders ?? []).filter(
    (o) =>
      !keyword ||
      [o.pickupAddress, o.supplierName, o.riderName ?? ""].some((v) => v.toLowerCase().includes(keyword)),
  );

  // 같은 컬럼 재클릭 시 asc/desc 토글, 다른 컬럼 클릭 시 그 컬럼 desc로 시작.
  function handleSort(column: AdminOrdersSortColumn) {
    setSort((s) => (s.column === column ? { column, ascending: !s.ascending } : { column, ascending: false }));
    setPage(0);
  }

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
  // 05 폴리시 패스: 서버 페이지네이션 도입 후에도 현재 페이지 rows 기준 동작을 유지한다(버튼 옆 캡션 참조).
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">현재 페이지 기준</span>
          <button
            type="button"
            onClick={handleCsv}
            className="h-8 rounded-button border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid="orders-csv-button"
          >
            CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatusFilter(f.value);
              setPage(0);
            }}
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
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          placeholder="현재 페이지 내 검색 (주소·공급업체·차량번호)"
          className="h-9 w-72 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary"
          data-testid="orders-search-input"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          aria-label="시작일"
          className="h-9 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary"
          data-testid="orders-date-from"
        />
        <span className="text-sm text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
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
              <SortableTh column="requested_kg" label="예상/확정 kg" sort={sort} onSort={handleSort} />
              <th className="px-4 py-3 font-medium">주소</th>
              <SortableTh column="created_at" label="생성일" sort={sort} onSort={handleSort} />
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
        {/* 05 폴리시 패스: 서버 페이지네이션(50건) — user 앱 OrdersHistoryPage와 같은 이전/다음 관용구. */}
        <div className="flex items-center justify-between border-t border-gray-50 px-4 py-2">
          <p className="text-xs text-gray-500">{ADMIN_ORDERS_PAGE_SIZE}건씩 표시</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-8 rounded-button border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
              data-testid="orders-prev-page"
            >
              이전
            </button>
            <span className="text-xs text-gray-500" data-testid="orders-page-indicator">
              {page + 1}페이지
            </span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 rounded-button border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
              data-testid="orders-next-page"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {selectedOrderId && (
        <OrderDetailDrawerContainer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
  );
}

/**
 * 05 폴리시 패스: 정렬 가능 헤더 셀. 클릭 시 asc/desc 토글(다른 컬럼이면 desc로 시작 —
 * OrdersPage.handleSort). 활성 컬럼에 ▲/▼ 표시 + aria-sort로 스크린리더에 정렬 방향을 알린다.
 */
function SortableTh({
  column,
  label,
  sort,
  onSort,
}: {
  column: AdminOrdersSortColumn;
  label: string;
  sort: AdminOrdersSort;
  onSort: (column: AdminOrdersSortColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={active ? (sort.ascending ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 font-medium hover:text-gray-700"
        data-testid={`orders-sort-${column}`}
      >
        {label}
        {active && <span aria-hidden="true">{sort.ascending ? "▲" : "▼"}</span>}
      </button>
    </th>
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

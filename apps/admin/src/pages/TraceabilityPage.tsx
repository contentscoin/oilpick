import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ORDER_STATUS_LABEL, formatKg, formatKrw, formatPoint } from "@oilpick/core";
import {
  TRACE_PAGE_SIZE,
  useBarcodeSummaries,
  useBarcodeTrace,
  useOrderBarcodes,
  type BarcodeSummaryRow,
  type BarcodeTraceRow,
} from "../hooks/useTraceability";
import { QueryError } from "../components/QueryError";
import { downloadCsv, toCsv } from "../lib/csv";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, TableMessageRow, TableShell } from "../components/ui";

/**
 * [19 T7]【admin】 유통이력 — 폐식용유 바코드(용기)별 회수 이력.
 * docs/spec/19-admin-console.md §1 T7.
 *
 * 왼쪽: 바코드 목록(최근 회수순 · 부분일치 검색 · 기간 필터 · 50건 페이지네이션).
 * 오른쪽: 선택 바코드의 회수 이력 타임라인(회차 역순) — 매장·라이더·좌상·주문상태·확정kg·
 *         지급수단/금액·정산 청구·GPS·현장 사진.
 *
 * 조회 전용 화면이다 — 상태 액션·원장 쓰기를 두지 않는다(절대 규칙 1·2, 19 §2).
 * `/traceability?order=<id>`로 들어오면 그 주문에 등록된 바코드부터 펼친다(주문 상세 진입점).
 */
export function TraceabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useBarcodeSummaries(keyword, dateFrom, dateTo, page);
  const rows = data?.rows;
  const hasNextPage = data?.hasNextPage ?? false;
  const loadFailed = isError && data === undefined;

  // 주문 축 진입(/traceability?order=<id>) — 주문 상세 드로어의 "유통이력 보기"가 넘어오는 경로.
  const orderParam = searchParams.get("order");
  const { data: orderItems } = useOrderBarcodes(orderParam);
  useEffect(() => {
    // 주문에 바코드가 하나뿐이면 곧바로 그 이력을 펼친다(클릭 한 번 절약).
    const only = orderParam && orderItems?.length === 1 ? orderItems[0] : undefined;
    if (only) setSelected(only.barcode);
  }, [orderParam, orderItems]);

  function clearOrderParam() {
    searchParams.delete("order");
    setSearchParams(searchParams, { replace: true });
  }

  function handleListCsv() {
    const csv = toCsv(
      ["바코드", "회수 횟수", "주문 수", "라이더 수", "최초 회수", "최근 회수"],
      (rows ?? []).map((r) => [
        r.barcode,
        r.pickupCount,
        r.orderCount,
        r.riderCount,
        r.firstSeenAt ? new Date(r.firstSeenAt).toLocaleString("ko-KR") : "",
        r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("ko-KR") : "",
      ]),
    );
    downloadCsv("유통이력_바코드목록", csv);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="유통이력"
        description="폐식용유 용기(바코드)가 언제 어느 매장에서 누구에게 회수됐는지 되짚어요."
        actions={
          <>
            <span className="text-xs text-gray-400">현재 페이지 기준</span>
            <Button size="sm" onClick={handleListCsv} data-testid="trace-csv-button">
              CSV
            </Button>
          </>
        }
      />

      {/* 주문 축 진입 안내 — 어떤 주문에서 넘어왔는지 보이지 않으면 맥락을 잃는다. */}
      {orderParam && (
        <Card
          title="주문에서 넘어왔어요"
          description={`주문 ${orderParam.slice(0, 8)}에 등록된 바코드예요.`}
          actions={
            <Button size="sm" onClick={clearOrderParam} data-testid="trace-clear-order">
              전체 목록 보기
            </Button>
          }
          data-testid="trace-order-context"
        >
          {orderItems && orderItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {orderItems.map((item) => (
                <Button
                  key={item.itemId}
                  size="sm"
                  variant={selected === item.barcode ? "primary" : "secondary"}
                  onClick={() => setSelected(item.barcode)}
                  data-testid={`trace-order-barcode-${item.barcode}`}
                >
                  {item.barcode}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">이 주문에는 등록된 바코드가 없어요.</p>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onValueChange={(v) => {
            setKeyword(v);
            setPage(0);
          }}
          label="바코드 검색(부분일치)"
          className="w-full sm:w-72"
          data-testid="trace-search-input"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          aria-label="최근 회수 시작일"
          className="min-h-9 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary"
          data-testid="trace-date-from"
        />
        <span className="text-sm text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          aria-label="최근 회수 종료일"
          className="min-h-9 rounded-button border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-primary"
          data-testid="trace-date-to"
        />
      </div>

      <TableShell
        headers={["바코드", "회수 횟수", "주문 수", "최초 회수", "최근 회수", ""]}
        data-testid="trace-table"
      >
        {loadFailed ? (
          <QueryError colSpan={6} onRetry={refetch} message="유통이력을 불러오지 못했어요" />
        ) : isLoading ? (
          <TableMessageRow colSpan={6}>불러오는 중...</TableMessageRow>
        ) : rows && rows.length > 0 ? (
          rows.map((row) => (
            <BarcodeRow
              key={row.barcode}
              row={row}
              selected={selected === row.barcode}
              onSelect={() => setSelected(row.barcode)}
            />
          ))
        ) : (
          <TableMessageRow colSpan={6}>
            {keyword || dateFrom || dateTo
              ? "조건에 맞는 바코드가 없어요."
              : "아직 등록된 바코드가 없어요. 라이더가 현장에서 바코드를 등록하면 여기에 쌓여요."}
          </TableMessageRow>
        )}
      </TableShell>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {page + 1}페이지 · 최대 {TRACE_PAGE_SIZE}건
        </span>
        <div className="flex gap-2">
          <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="trace-prev">
            이전
          </Button>
          <Button size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)} data-testid="trace-next">
            다음
          </Button>
        </div>
      </div>

      {selected && <BarcodeTracePanel barcode={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BarcodeRow({
  row,
  selected,
  onSelect,
}: {
  row: BarcodeSummaryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${selected ? "bg-primary-light/40" : ""}`}
      data-testid={`trace-row-${row.barcode}`}
    >
      <td className="px-4 py-3 font-medium text-gray-900">
        <div className="min-w-0 truncate">{row.barcode}</div>
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-800">
        {row.pickupCount}회
        {row.pickupCount > 1 && (
          <Badge tone="accent" className="ml-2">
            재사용
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-800">{row.orderCount}건</td>
      <td className="px-4 py-3 text-gray-500">
        {row.firstSeenAt ? new Date(row.firstSeenAt).toLocaleDateString("ko-KR") : "-"}
      </td>
      <td className="px-4 py-3 text-gray-500">
        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("ko-KR") : "-"}
      </td>
      <td className="px-4 py-3">
        <Button size="sm" onClick={onSelect} data-testid={`trace-open-${row.barcode}`}>
          이력 보기
        </Button>
      </td>
    </tr>
  );
}

/** 선택 바코드의 회수 이력 — 회차 역순 타임라인. 조회 전용. */
function BarcodeTracePanel({ barcode, onClose }: { barcode: string; onClose: () => void }) {
  const { data: trace, isLoading, isError, refetch } = useBarcodeTrace(barcode);

  const totalKg = useMemo(
    () => (trace ?? []).reduce((sum, t) => sum + (t.finalKg ?? t.measuredKg ?? 0), 0),
    [trace],
  );

  function handleTraceCsv() {
    const csv = toCsv(
      ["회차", "회수일시", "매장", "주소", "라이더", "차량번호", "좌상", "주문상태", "확정kg", "지급수단", "지급액", "정산", "주문ID"],
      (trace ?? []).map((t, i) => [
        (trace?.length ?? 0) - i,
        new Date(t.seenAt).toLocaleString("ko-KR"),
        t.storeName,
        t.pickupAddress,
        t.riderName,
        t.vehicleNumber,
        t.dealerName ?? "본사 직속",
        ORDER_STATUS_LABEL[t.orderStatus] ?? t.orderStatus,
        t.finalKg ?? t.measuredKg,
        t.payoutMethod ?? "",
        t.cashPaidAmount,
        t.dealerSettlementId ? (t.settlementStatus ?? "청구됨") : "미정산",
        t.orderId,
      ]),
    );
    downloadCsv(`유통이력_${barcode}`, csv);
  }

  return (
    <Card
      title={`바코드 ${barcode}`}
      description={
        trace && trace.length > 0
          ? `회수 ${trace.length}회 · 누적 ${formatKg(totalKg)}`
          : "이 바코드의 회수 이력이에요."
      }
      actions={
        <>
          <Button size="sm" onClick={handleTraceCsv} data-testid="trace-detail-csv">
            CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="trace-detail-close">
            닫기
          </Button>
        </>
      }
      data-testid="trace-detail"
    >
      {isError && !trace ? (
        <div className="text-sm">
          <QueryError onRetry={refetch} message="이력을 불러오지 못했어요" />
        </div>
      ) : isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : trace && trace.length > 0 ? (
        <ol className="flex flex-col" data-testid="trace-timeline">
          {trace.map((t, i) => (
            <TraceEvent key={t.itemId} event={t} round={trace.length - i} isLast={i === trace.length - 1} />
          ))}
        </ol>
      ) : (
        <EmptyState title="회수 이력이 없어요" description="이 바코드로 등록된 현장 회수 기록을 찾지 못했어요." />
      )}
    </Card>
  );
}

/** 회수 1회차 — 주문 관리로 되돌아가는 링크와 GPS·사진 근거를 함께 둔다. */
function TraceEvent({ event, round, isLast }: { event: BarcodeTraceRow; round: number; isLast: boolean }) {
  const kg = event.finalKg ?? event.measuredKg;
  return (
    <li className="relative flex items-start gap-3 pb-4 last:pb-0" data-testid={`trace-event-${event.itemId}`}>
      {/* 도트 컬럼 self-stretch — 행 높이를 유지해 연결선(flex-1)이 끊기지 않게 한다. */}
      <div className="flex flex-col items-center self-stretch">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill bg-primary" />
        {!isLast && <span className="w-px flex-1 bg-gray-200" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
          <Badge tone="neutral">{round}회차</Badge>
          <span>{new Date(event.seenAt).toLocaleString("ko-KR")}</span>
          <Badge tone={event.orderStatus === "COMPLETED" ? "primary" : "warning"}>
            {ORDER_STATUS_LABEL[event.orderStatus] ?? event.orderStatus}
          </Badge>
        </p>
        <p className="mt-1 text-sm text-gray-700">
          {event.storeName ?? "매장 미상"}
          <span className="ml-1 text-xs text-gray-500">{event.pickupAddress}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>
            라이더 {event.riderName ?? "-"}
            {event.vehicleNumber && ` (${event.vehicleNumber})`}
          </span>
          <span>좌상 {event.dealerName ?? "본사 직속"}</span>
          {kg !== null && <span>확정 {formatKg(kg)}</span>}
          {event.cashPaidAmount !== null && (
            <span>
              지급{" "}
              {event.payoutMethod === "POINT" ? formatPoint(event.cashPaidAmount) : formatKrw(event.cashPaidAmount)}
            </span>
          )}
          <span>{event.dealerSettlementId ? `정산 ${event.settlementStatus ?? "청구됨"}` : "미정산"}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            to={`/orders?order=${event.orderId}`}
            className="text-xs font-medium text-primary underline underline-offset-2"
            data-testid={`trace-order-link-${event.itemId}`}
          >
            주문 상세
          </Link>
          {event.geoLat != null && event.geoLng != null && (
            <a
              href={`https://map.kakao.com/link/map/회수지점,${event.geoLat},${event.geoLng}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary underline underline-offset-2"
              data-testid={`trace-geo-link-${event.itemId}`}
            >
              GPS 지도
            </a>
          )}
          {event.photoUrl && (
            <a href={event.photoUrl} target="_blank" rel="noreferrer" data-testid={`trace-photo-${event.itemId}`}>
              <img
                src={event.photoUrl}
                alt={`${event.barcode} 현장 사진`}
                className="h-16 w-16 rounded-button border border-gray-100 object-cover transition-shadow hover:shadow-card"
              />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

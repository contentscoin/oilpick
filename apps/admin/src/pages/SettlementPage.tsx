import { useState } from "react";
import { formatKg, formatKrw, formatRelativeTime } from "@oilpick/core";
import {
  useCouponLedgerAudit,
  useCouponPurchases,
  useCouponSalesDaily,
  usePickupStatsDaily,
  type CouponPurchaseRow,
} from "../hooks/useSalesAdmin";
import { COUPON_ENTRY_LABEL, sumCouponSales } from "../lib/couponSales";
import { downloadCsv, toCsv } from "../lib/csv";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { QueryError } from "../components/QueryError";
import type { CouponRefundOutput } from "@oilpick/core";

const PURCHASE_STATUS_LABEL: Record<string, string> = {
  PENDING: "결제 대기",
  PAID: "결제 완료",
  FAILED: "실패",
  EXPIRED: "만료(대사 필요)",
  REFUNDED: "환불됨",
};

/**
 * 07 F10-③: /settlement → "매출·정산" 재편. 구모델의 출금 큐/point_ledger UI를 제거하고
 * (D1 포인트 폐기 — 이 라우트에서 useSettlementAdmin 참조 0, 파일 삭제는 F13):
 *  ⓐ 쿠폰 매출 대시(v_coupon_sales_daily — 일별 판매액/장수/환불 구분, 최근 14일)
 *  ⓑ 수거 활동 추이(v_pickup_stats_daily — 일별 건수/kg/현금 거래액, 매출과 상관 확인용)
 *  ⓒ 쿠폰 원장 감사(coupon_ledger 최근 100건, entry_type 라벨)
 *  ⓓ 결제 목록(coupon_purchases — status 필터, EXPIRED 대사 포함) + [환불](coupon-refund — 건당 1회)
 *  ⑥ CSV 내보내기(원장/일별 매출 — BOM 포함, 06 E10-③).
 */
export function SettlementPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">매출·정산</h1>
        <p className="text-sm text-gray-500">쿠폰 매출과 수거 활동을 확인하고 결제를 관리해요.</p>
      </div>

      <CouponSalesSection />
      <PickupStatsSection />
      <CouponLedgerSection />
      <PurchasesSection />
    </div>
  );
}

/** ⓐ 쿠폰 매출 대시 — 판매(CHARGE)와 환불(귀책 REFUND / PG 환불 ADJUST) 구분 병기(07 §1-4). */
function CouponSalesSection() {
  const { data: rows, isLoading, isError, refetch } = useCouponSalesDaily(14);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && rows === undefined;
  // 로딩/실패 중엔 0으로 계산해 점프하지 않도록 데이터가 있을 때만 합산한다("-" 표시).
  const totals = rows ? sumCouponSales(rows) : null;

  function handleCsv() {
    const csv = toCsv(
      ["날짜", "판매 장수", "판매액(원)", "귀책 환급(장)", "PG 환불(장)", "수동 조정(장)"],
      (rows ?? []).map((r) => [r.day, r.chargedQty, r.salesAmount, r.refundQty, r.pgRefundQty, r.manualAdjustQty]),
    );
    downloadCsv("쿠폰_일별매출", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">쿠폰 매출 (최근 14일)</h2>
        <button
          type="button"
          onClick={handleCsv}
          className="h-8 rounded-button border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
          data-testid="sales-csv-button"
        >
          CSV
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryStat label="판매액 합계" value={totals ? formatKrw(totals.salesAmount) : "-"} accent testId="sales-total-amount" />
        <SummaryStat label="판매 장수" value={totals ? `${totals.chargedQty.toLocaleString("ko-KR")}장` : "-"} testId="sales-total-qty" />
        <SummaryStat label="귀책 환급" value={totals ? `${totals.refundQty.toLocaleString("ko-KR")}장` : "-"} testId="sales-total-refund" />
        <SummaryStat label="PG 환불" value={totals ? `${totals.pgRefundQty.toLocaleString("ko-KR")}장` : "-"} testId="sales-total-pg-refund" />
      </div>

      {/* 로딩 중에도 thead를 유지해 레이아웃 시프트를 없앤다 — 로딩/에러/빈 상태는 tbody 행으로. */}
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="coupon-sales-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">날짜</th>
              <th className="py-2 font-medium">판매 장수</th>
              <th className="py-2 font-medium">판매액</th>
              <th className="py-2 font-medium">귀책 환급</th>
              <th className="py-2 font-medium">PG 환불</th>
              <th className="py-2 font-medium">수동 조정</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={6} onRetry={refetch} message="쿠폰 매출을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  최근 14일 매출 데이터가 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.day} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{r.day}</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.chargedQty}장</td>
                  <td className="py-2 font-medium tabular-nums text-accent-deep">{formatKrw(r.salesAmount)}</td>
                  <td className="py-2 tabular-nums text-gray-700">{r.refundQty}장</td>
                  <td className="py-2 tabular-nums text-gray-700">{r.pgRefundQty}장</td>
                  <td className="py-2 tabular-nums text-gray-500">
                    {r.manualAdjustQty >= 0 ? "+" : ""}
                    {r.manualAdjustQty}장
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ⓑ 수거 활동 추이 — 일별 완료 건수/kg/현금 거래액(completed_at 기준). 매출과 상관 확인용. */
function PickupStatsSection() {
  const { data: rows, isLoading, isError, refetch } = usePickupStatsDaily(14);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && rows === undefined;

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">수거 활동 추이 (최근 14일)</h2>
      <p className="mb-4 text-xs text-gray-500">쿠폰 매출과의 상관을 확인해요 — 수거가 늘면 쿠폰 소진·재구매가 따라와요.</p>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="pickup-stats-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">날짜</th>
              <th className="py-2 font-medium">완료 건수</th>
              <th className="py-2 font-medium">수거 kg</th>
              <th className="py-2 font-medium">현금 거래액</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={4} onRetry={refetch} message="수거 활동 추이를 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500">
                  최근 14일 수거 완료 데이터가 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.day} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{r.day}</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.completedCount}건</td>
                  <td className="py-2 tabular-nums text-gray-800">{formatKg(r.totalKg)}</td>
                  <td className="py-2 font-medium tabular-nums text-accent-deep">{formatKrw(r.totalCash)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ⓒ 쿠폰 원장 감사 — coupon_ledger 최근 100건(append-only, entry_type 라벨). */
function CouponLedgerSection() {
  const { data: ledger, isLoading, isError, refetch } = useCouponLedgerAudit(100);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && ledger === undefined;

  function handleCsv() {
    const csv = toCsv(
      ["일시", "라이더", "유형", "수량(장)", "단가(원)", "주문ID", "구매ID", "메모"],
      (ledger ?? []).map((r) => [
        new Date(r.createdAt).toLocaleString("ko-KR"),
        r.riderName,
        COUPON_ENTRY_LABEL[r.entryType] ?? r.entryType,
        r.qty,
        r.unitPrice,
        r.orderId,
        r.purchaseId,
        r.memo,
      ]),
    );
    downloadCsv("쿠폰_원장", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">쿠폰 원장 감사 (최근 100건)</h2>
        <button
          type="button"
          onClick={handleCsv}
          className="h-8 rounded-button border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
          data-testid="ledger-csv-button"
        >
          CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="coupon-ledger-audit-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">일시</th>
              <th className="py-2 font-medium">라이더</th>
              <th className="py-2 font-medium">유형</th>
              <th className="py-2 font-medium">수량</th>
              <th className="py-2 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={5} onRetry={refetch} message="쿠폰 원장을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (ledger ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  쿠폰 원장 기록이 없어요.
                </td>
              </tr>
            ) : (
              (ledger ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-500">{new Date(row.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="py-2 text-gray-800">{row.riderName}</td>
                  <td className="py-2 text-gray-700">
                    {COUPON_ENTRY_LABEL[row.entryType] ?? row.entryType}
                    {row.entryType === "ADJUST" && row.purchaseId && (
                      <span className="ml-1 rounded-pill bg-status-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-danger">
                        PG 환불
                      </span>
                    )}
                  </td>
                  <td className={`py-2 tabular-nums font-medium ${row.qty >= 0 ? "text-primary" : "text-status-danger"}`}>
                    {row.qty >= 0 ? "+" : ""}
                    {row.qty}장
                  </td>
                  <td className="py-2 text-gray-500">{row.memo ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ⓓ 결제 목록 — status 필터(EXPIRED 대사 포함) + PAID 건 [환불](coupon-refund). */
function PurchasesSection() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const { data: purchases, isLoading, isError, refetch } = useCouponPurchases(statusFilter);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && purchases === undefined;

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-gray-900">쿠폰 결제 목록</h2>
        {/* 목록은 useCouponPurchases limit(200) — 환불 대상 탐색 시 상한을 명시한다. */}
        <span className="text-xs text-gray-500">최근 200건 기준</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-white shadow-card" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            data-testid={`purchase-filter-${s}`}
          >
            {s === "ALL" ? "전체" : PURCHASE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {statusFilter === "EXPIRED" && (
        <p className="mb-3 rounded-card bg-accent-light px-3 py-2 text-xs text-accent-deep" data-testid="expired-reconcile-note">
          만료(EXPIRED) 건은 결제 승인 후 확정이 유실됐을 수 있어요 — 토스 결제 조회에서 승인 여부를 확인한 뒤 수동
          처리하세요(orphan 결제 대사).
        </p>
      )}

      {loadFailed ? (
        <QueryError onRetry={refetch} message="결제 목록을 불러오지 못했어요" />
      ) : isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : purchases && purchases.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="purchase-list">
          {purchases.map((p) => (
            <PurchaseRow key={p.id} purchase={p} onProcessed={refetch} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">해당 상태의 결제 건이 없어요.</p>
      )}
    </section>
  );
}

function PurchaseRow({ purchase, onProcessed }: { purchase: CouponPurchaseRow; onProcessed: () => void }) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefund(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("환불 사유를 입력해주세요.");
      return;
    }
    let qtyNum: number | undefined;
    if (qty !== "") {
      qtyNum = Number(qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > purchase.qty) {
        setError(`환불 수량은 1~${purchase.qty}장 사이의 정수로 입력해주세요(비우면 전액).`);
        return;
      }
    }
    setBusy(true);
    const result = await invokeEdgeFunction<CouponRefundOutput>("coupon-refund", {
      purchaseId: purchase.id,
      ...(qtyNum !== undefined ? { qty: qtyNum } : {}),
      reason: trimmedReason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(`쿠폰 ${result.data.refundedQty}장이 환불되었어요. (잔액 ${result.data.balance}장)`);
    setRefundOpen(false);
    onProcessed();
  }

  const statusColor =
    purchase.status === "PAID"
      ? "bg-primary-light text-primary"
      : purchase.status === "REFUNDED"
        ? "bg-status-danger/10 text-status-danger"
        : purchase.status === "EXPIRED"
          ? "bg-accent-light text-accent-deep"
          : "bg-gray-100 text-gray-600";

  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-gray-100 bg-white p-4 shadow-card"
      data-testid={`purchase-row-${purchase.id}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">
            {purchase.riderName} ·{" "}
            <span className="tabular-nums text-accent-deep">
              {purchase.qty}장 / {formatKrw(purchase.amount)}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            단가 {formatKrw(purchase.unitPrice)} · {purchase.pgOrderId} · {formatRelativeTime(purchase.createdAt)}
          </p>
        </div>
        <span className={`rounded-pill px-3 py-1 text-xs font-semibold ${statusColor}`}>
          {PURCHASE_STATUS_LABEL[purchase.status]}
        </span>
      </div>

      {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
      {message && <p className="text-sm font-medium text-primary">{message}</p>}

      {purchase.status === "PAID" &&
        (refundOpen ? (
          <form onSubmit={handleRefund} className="flex flex-col gap-2 rounded-card bg-gray-50 p-3">
            <p className="text-xs text-gray-500">
              환불은 <span className="font-semibold">구매 건당 1회</span>만 가능해요(부분 환불도 1회로 소진). 금액은 이
              건의 단가({formatKrw(purchase.unitPrice)}/장) 기준으로 계산돼요.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                max={purchase.qty}
                placeholder={`수량(비우면 전액 ${purchase.qty}장)`}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-52 rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                data-testid={`refund-qty-${purchase.id}`}
              />
              <input
                type="text"
                placeholder="환불 사유(필수)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                data-testid={`refund-reason-${purchase.id}`}
              />
              <button
                type="submit"
                disabled={busy}
                className="h-9 rounded-button bg-status-danger px-3 text-sm font-semibold text-white disabled:opacity-60"
                data-testid={`refund-submit-${purchase.id}`}
              >
                환불 실행
              </button>
              <button
                type="button"
                onClick={() => setRefundOpen(false)}
                className="h-9 rounded-button border border-gray-200 px-3 text-sm font-medium text-gray-600"
                data-testid={`refund-cancel-${purchase.id}`}
              >
                닫기
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setRefundOpen(true)}
              className="h-9 rounded-button border border-status-danger px-3 text-sm font-semibold text-status-danger hover:bg-status-danger/5"
              data-testid={`refund-open-${purchase.id}`}
            >
              환불
            </button>
          </div>
        ))}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent = false,
  testId,
}: {
  label: string;
  value: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div className="rounded-card border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-gray-900"}`} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

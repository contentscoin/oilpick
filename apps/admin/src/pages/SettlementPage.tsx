import { useState } from "react";
import { formatKg, formatKrw, formatPoint, formatRelativeTime, type WithdrawProcessOutput } from "@oilpick/core";
import {
  useCouponSalesDaily,
  usePickupStatsDaily,
  usePointLedgerAudit,
  useRiderPayouts,
  useWithdrawals,
  type WithdrawalRow,
} from "../hooks/useSettlementAdmin";
import { sumCouponSales } from "../lib/couponSales";
import { downloadCsv, toCsv } from "../lib/csv";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { QueryError } from "../components/QueryError";

const WITHDRAW_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "신청됨",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  PAID: "지급 완료",
};

/** 00-domain.md 포인트 원장 규칙(08 복권)의 entry_type 한글 라벨. HOLD/RELEASE는 레거시 표기. */
const POINT_ENTRY_LABEL: Record<string, string> = {
  EARN: "매각대금 적립",
  HOLD: "수거비 보류(레거시)",
  RELEASE: "보류 확정(레거시)",
  WITHDRAW_REQUEST: "출금 신청",
  WITHDRAW_CANCEL: "출금 반려 복구",
  ADJUST: "관리자 조정",
  PURCHASE: "쇼핑몰 결제",
  TRADE_PURCHASE: "새 기름 결제(차감)",
};

/**
 * 08 G7-①: /settlement → "정산" 재편 + [17 Q4] 쿠폰 판매 통계 복원(수거쿠폰 복권 — 08 P1 역전).
 *  ⓐ 출금 큐(withdrawals — REQUESTED 승인/반려, APPROVED 지급 완료. withdraw-process Edge Function)
 *  ⓑ 쿠폰 판매 통계(v_coupon_sales_daily — 일별 충전/매출액/환불 구분, 07 F10-③ⓐ 원형.
 *    쿠폰 판매가 플랫폼 수익 모델이다, 17 §0. 결제 목록·환불 처리는 /users 라이더 패널로 이동)
 *  ⓒ 수거 활동 추이(v_pickup_stats_daily — 일별 건수/kg/현금·포인트 지급 분리)
 *  ⓓ 라이더별 지급 실적(v_rider_payout_daily 30일 합산 — 라이더-플랫폼 오프라인 정산 근거, 08 P5)
 *  ⓔ 포인트 원장 감사(point_ledger 최근 100건, append-only)
 *  + CSV 내보내기(출금 큐/쿠폰 판매/포인트 원장 — BOM 포함, 06 E10-③).
 */
export function SettlementPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">정산</h1>
        <p className="text-sm text-gray-500">출금 신청을 처리하고 쿠폰 판매·포인트 지급 흐름을 확인해요.</p>
      </div>

      <WithdrawQueueSection />
      <CouponSalesSection />
      <PickupStatsSection />
      <RiderPayoutSection />
      <PointLedgerSection />
    </div>
  );
}

/**
 * [17 Q4] ⓑ 쿠폰 판매 통계 — 판매(CHARGE)와 환불(귀책 REFUND / PG 환불 ADJUST) 구분 병기(17 C4).
 * v_coupon_sales_daily(is_admin 게이트 뷰) 일별 행 + 합계 카드 + CSV(BOM — lib/csv 재사용).
 */
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">쿠폰 판매 (최근 14일)</h2>
        <button
          type="button"
          onClick={handleCsv}
          className="min-h-8 shrink-0 rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
              <QueryError colSpan={6} onRetry={refetch} message="쿠폰 판매 통계를 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  최근 14일 판매 데이터가 없어요.
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

/** ⓐ 출금 큐 — REQUESTED [승인]/[반려(사유)], APPROVED [지급 완료]. 처리 후 Realtime invalidate. */
function WithdrawQueueSection() {
  const [statusFilter, setStatusFilter] = useState("REQUESTED");
  const { data: rows, isLoading, isError, refetch } = useWithdrawals(statusFilter);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && rows === undefined;

  function handleCsv() {
    const csv = toCsv(
      ["신청일", "이름", "금액(P)", "상태", "은행", "계좌", "예금주", "처리 메모"],
      (rows ?? []).map((r) => [
        new Date(r.createdAt).toLocaleString("ko-KR"),
        r.userName,
        r.amount,
        WITHDRAW_STATUS_LABEL[r.status] ?? r.status,
        r.bankName,
        r.bankAccount,
        r.bankHolder,
        r.adminMemo,
      ]),
    );
    downloadCsv("출금_큐", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">출금 큐</h2>
        <button
          type="button"
          onClick={handleCsv}
          className="min-h-8 shrink-0 rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          data-testid="withdraw-csv-button"
        >
          CSV
        </button>
      </div>

      {/* [08 Q2·Q4] 이체 금액 산정 기준 — 세무 공제는 이체 단계에서 적용(원장 무기록). 수수료 1,000P는 신청 시 이미 차감됨. */}
      <p className="mb-4 text-xs leading-relaxed text-gray-500">
        이체 금액 기준: 개인은 신청액(부가세 제외)에서 사업소득 3.3% 공제, 사업자 정보(세금계산서 발행) 등록
        시 부가세 포함 지급. 출금 수수료 1,000P는 신청 시점에 포인트에서 이미 차감돼 있어요.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {["REQUESTED", "APPROVED", "REJECTED", "PAID", "ALL"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-white shadow-card" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            data-testid={`withdraw-filter-${s}`}
          >
            {s === "ALL" ? "전체" : WITHDRAW_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loadFailed ? (
        <QueryError onRetry={refetch} message="출금 신청을 불러오지 못했어요" />
      ) : isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : rows && rows.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="withdraw-list">
          {rows.map((w) => (
            <WithdrawRowCard key={w.id} withdrawal={w} onProcessed={refetch} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500" data-testid="withdraw-empty">
          해당 상태의 출금 신청이 없어요.
        </p>
      )}
    </section>
  );
}

function WithdrawRowCard({ withdrawal, onProcessed }: { withdrawal: WithdrawalRow; onProcessed: () => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function process(decision: "APPROVED" | "REJECTED" | "PAID", processMemo?: string) {
    setError(null);
    setBusy(true);
    const result = await invokeEdgeFunction<WithdrawProcessOutput>("withdraw-process", {
      withdrawalId: withdrawal.id,
      decision,
      ...(processMemo ? { memo: processMemo } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRejectOpen(false);
    onProcessed();
  }

  function handleReject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = memo.trim();
    if (!trimmed) {
      setError("반려 사유를 입력해주세요.");
      return;
    }
    void process("REJECTED", trimmed);
  }

  const statusColor =
    withdrawal.status === "REQUESTED"
      ? "bg-accent-light text-accent-deep"
      : withdrawal.status === "APPROVED"
        ? "bg-primary-light text-primary"
        : withdrawal.status === "PAID"
          ? "bg-primary-light text-primary"
          : "bg-status-danger/10 text-status-danger";

  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-gray-100 bg-white p-4 shadow-card"
      data-testid={`withdraw-row-${withdrawal.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {withdrawal.userName} · <span className="tabular-nums text-accent-deep">{formatPoint(withdrawal.amount)}</span>
          </p>
          <p className="text-xs text-gray-500">
            {withdrawal.bankName} {withdrawal.bankAccount} (예금주 {withdrawal.bankHolder}) ·{" "}
            {formatRelativeTime(withdrawal.createdAt)}
          </p>
          {withdrawal.adminMemo && <p className="text-xs text-gray-500">메모: {withdrawal.adminMemo}</p>}
        </div>
        <span className={`shrink-0 rounded-pill px-3 py-1 text-xs font-semibold ${statusColor}`}>
          {WITHDRAW_STATUS_LABEL[withdrawal.status]}
        </span>
      </div>

      {error && <p className="text-sm font-medium text-status-danger">{error}</p>}

      {withdrawal.status === "REQUESTED" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void process("APPROVED")}
            className="min-h-9 rounded-button bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            data-testid={`withdraw-approve-${withdrawal.id}`}
          >
            승인
          </button>
          {rejectOpen ? (
            <form onSubmit={handleReject} className="flex flex-1 flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="반려 사유(필수) — 포인트가 복구돼요"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="flex-1 rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                data-testid={`withdraw-reject-memo-${withdrawal.id}`}
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-9 rounded-button bg-status-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                data-testid={`withdraw-reject-submit-${withdrawal.id}`}
              >
                반려 확정
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="min-h-9 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600"
              >
                닫기
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="min-h-9 rounded-button border border-status-danger px-3 py-2 text-sm font-semibold text-status-danger hover:bg-status-danger/5"
              data-testid={`withdraw-reject-${withdrawal.id}`}
            >
              반려
            </button>
          )}
        </div>
      )}

      {withdrawal.status === "APPROVED" && (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void process("PAID")}
            className="min-h-9 rounded-button bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            data-testid={`withdraw-paid-${withdrawal.id}`}
          >
            지급 완료(이체함)
          </button>
        </div>
      )}
    </div>
  );
}

/** ⓒ 수거 활동 추이 — 일별 완료 건수/kg/현금·포인트 지급 분리(completed_at 기준, 08 G2-③). */
function PickupStatsSection() {
  const { data: rows, isLoading, isError, refetch } = usePickupStatsDaily(14);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && rows === undefined;

  const totals = rows
    ? rows.reduce(
        (acc, r) => ({
          count: acc.count + r.completedCount,
          kg: acc.kg + r.totalKg,
          cash: acc.cash + r.cashAmount,
          point: acc.point + r.pointAmount,
        }),
        { count: 0, kg: 0, cash: 0, point: 0 },
      )
    : null;

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">수거 활동 추이 (최근 14일)</h2>
      <p className="mb-4 text-xs text-gray-500">현장 지급을 수단별로 나눠 봐요 — 포인트 지급이 늘면 출금 수요가 따라와요.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="완료 건수" value={totals ? `${totals.count.toLocaleString("ko-KR")}건` : "-"} testId="pickup-total-count" />
        <SummaryStat label="수거 kg" value={totals ? formatKg(totals.kg) : "-"} testId="pickup-total-kg" />
        <SummaryStat label="현금 지급" value={totals ? formatKrw(totals.cash) : "-"} accent testId="pickup-total-cash" />
        <SummaryStat label="포인트 지급" value={totals ? formatPoint(totals.point) : "-"} accent testId="pickup-total-point" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="pickup-stats-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">날짜</th>
              <th className="py-2 font-medium">완료 건수</th>
              <th className="py-2 font-medium">수거 kg</th>
              <th className="py-2 font-medium">현금 지급</th>
              <th className="py-2 font-medium">포인트 지급</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={5} onRetry={refetch} message="수거 활동 추이를 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  최근 14일 수거 완료 데이터가 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.day} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{r.day}</td>
                  <td className="py-2 tabular-nums text-gray-800">
                    {r.completedCount}건
                    <span className="ml-1 text-xs text-gray-400">
                      (현금 {r.cashCount}·포인트 {r.pointCount})
                    </span>
                  </td>
                  <td className="py-2 tabular-nums text-gray-800">{formatKg(r.totalKg)}</td>
                  <td className="py-2 font-medium tabular-nums text-accent-deep">{formatKrw(r.cashAmount)}</td>
                  <td className="py-2 font-medium tabular-nums text-primary">{formatPoint(r.pointAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ⓓ 라이더별 지급 실적(최근 30일 합산) — 라이더-플랫폼 오프라인 정산·청구 근거(08 P5). */
function RiderPayoutSection() {
  const { data: rows, isLoading, isError, refetch } = useRiderPayouts(30);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && rows === undefined;

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">라이더별 지급 실적 (최근 30일)</h2>
      <p className="mb-4 text-xs text-gray-500">
        포인트 지급분은 플랫폼이 점주에게 적립(EARN)해요 — 라이더 정산·청구는 이 표를 근거로 해요(08 P5).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="rider-payout-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">라이더</th>
              <th className="py-2 font-medium">완료 건수</th>
              <th className="py-2 font-medium">수거 kg</th>
              <th className="py-2 font-medium">현금 지급</th>
              <th className="py-2 font-medium">포인트 지급(정산 대상)</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={5} onRetry={refetch} message="라이더 지급 실적을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  최근 30일 지급 실적이 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.riderId} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{r.riderName}</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.completedCount}건</td>
                  <td className="py-2 tabular-nums text-gray-800">{formatKg(r.totalKg)}</td>
                  <td className="py-2 tabular-nums text-gray-700">{formatKrw(r.cashAmount)}</td>
                  <td className="py-2 font-semibold tabular-nums text-accent-deep">{formatPoint(r.pointAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ⓔ 포인트 원장 감사 — point_ledger 최근 100건(append-only, entry_type 라벨). */
function PointLedgerSection() {
  const { data: ledger, isLoading, isError, refetch } = usePointLedgerAudit(100);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && ledger === undefined;

  function handleCsv() {
    const csv = toCsv(
      ["일시", "회원", "유형", "금액(P)", "주문ID", "출금ID", "메모"],
      (ledger ?? []).map((r) => [
        new Date(r.createdAt).toLocaleString("ko-KR"),
        r.userName,
        POINT_ENTRY_LABEL[r.entryType] ?? r.entryType,
        r.amount,
        r.orderId,
        r.withdrawalId,
        r.memo,
      ]),
    );
    downloadCsv("포인트_원장", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">포인트 원장 감사 (최근 100건)</h2>
        <button
          type="button"
          onClick={handleCsv}
          className="min-h-8 shrink-0 rounded-button border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          data-testid="point-ledger-csv-button"
        >
          CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="point-ledger-audit-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">일시</th>
              <th className="py-2 font-medium">회원</th>
              <th className="py-2 font-medium">유형</th>
              <th className="py-2 font-medium">금액</th>
              <th className="py-2 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={5} onRetry={refetch} message="포인트 원장을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (ledger ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  포인트 원장 기록이 없어요.
                </td>
              </tr>
            ) : (
              (ledger ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-500">{new Date(row.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="py-2 text-gray-800">{row.userName}</td>
                  <td className="py-2 text-gray-700">{POINT_ENTRY_LABEL[row.entryType] ?? row.entryType}</td>
                  <td className={`py-2 tabular-nums font-medium ${row.amount >= 0 ? "text-primary" : "text-status-danger"}`}>
                    {row.amount >= 0 ? "+" : "-"}
                    {formatPoint(Math.abs(row.amount))}
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

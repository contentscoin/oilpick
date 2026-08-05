import { useState } from "react";
import { PAYOUT_METHOD_LABEL, formatKrw, formatPoint, formatRelativeTime } from "@oilpick/core";
import { useDealerSettlements, useDealerStatements, useDealerUnsettledOrders } from "../hooks/useDealersAdmin";
import { downloadSettlementCsv } from "../lib/settlementCsv";

/**
 * [14 J3]【dealer】 좌상 본인 정산 명세(/statement). v_dealer_statement·dealer_settlements는
 * RLS로 본인 행만 조회된다(읽기 전용 — 계정 설정·청구는 admin이 수행). §5.
 * [16 L7] 정산 셀프서비스: ① '미정산 내역' 섹션(usage 카드와 1:1 대사 — POINT 순액 합계 병기)
 * ② 청구 이력 행별 [CSV](admin과 공용 lib) — 매 청구마다 본사에 명세를 요청하던 왕복 제거.
 */
export function DealerStatementPage() {
  const { data: statements, isLoading } = useDealerStatements();
  const { data: settlements } = useDealerSettlements();
  const { data: unsettled } = useDealerUnsettledOrders();
  const [csvBusy, setCsvBusy] = useState<string | null>(null);
  const stmt = statements?.[0]; // RLS로 본인 1행

  // usage(§4) = 미정산 POINT 순액 합(minted − spent) — CASH는 정산 무관(수수료 베이스에만 포함).
  // 이 합계가 위 '미정산 사용액' 카드와 일치해야 대사가 맞는 것이다.
  const pointNetSum = (unsettled ?? [])
    .filter((o) => o.payout_method === "POINT")
    .reduce((s, o) => s + (o.net_amount ?? 0), 0);

  async function handleCsv(settlementId: string) {
    setCsvBusy(settlementId);
    await downloadSettlementCsv(settlementId);
    setCsvBusy(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">내 정산 명세</h1>
        <p className="text-sm text-gray-500">보증금 담보 사용한도와 미정산 사용액이에요. 청구·정산은 본사가 처리해요.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : !stmt ? (
        <p className="rounded-card bg-white p-6 text-sm text-gray-500 shadow-card" data-testid="dealer-statement-empty">
          아직 계정이 설정되지 않았어요. 본사에 문의해 주세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="dealer-statement-summary">
          <StatCard label="사용한도" value={formatPoint(stmt.credit_limit)} />
          <StatCard label="미정산 사용액" value={formatPoint(stmt.usage)} accent={stmt.over_threshold} />
          <StatCard label="남은 여유" value={formatPoint(stmt.headroom)} />
          <StatCard label="보증금" value={formatKrw(stmt.deposit_amount)} />
        </div>
      )}

      {/* [16 L7] 미정산 내역 — usage 카드 숫자의 근거 주문. 포인트 순액 합계로 1:1 대사. */}
      <div className="rounded-card bg-white p-6 shadow-card" data-testid="dealer-unsettled">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">미정산 내역</h2>
        <p className="mb-4 text-xs text-gray-500">
          아직 청구되지 않은 완료 주문이에요. 포인트 순액 합계가 위 미정산 사용액과 일치해요.
        </p>
        <div className="overflow-x-auto">
          {/* [03 레이아웃 강건성] 표 전체 nowrap 제거 — 글자 확대 시 셀 줄바꿈을 허용한다. */}
          <table className="w-full text-left text-sm" data-testid="dealer-unsettled-table">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="py-2 font-medium">주문</th>
                <th className="py-2 font-medium">지급수단</th>
                <th className="py-2 font-medium">폐유 총액</th>
                <th className="py-2 font-medium">신유 대금</th>
                <th className="py-2 font-medium">순액</th>
                <th className="py-2 font-medium">완료일</th>
              </tr>
            </thead>
            <tbody>
              {(unsettled ?? []).map((o) => (
                <tr key={o.order_id} className="border-b border-gray-50" data-testid={`unsettled-${o.order_id}`}>
                  <td className="py-2 text-gray-500">{o.order_id.slice(0, 8)}</td>
                  <td className="py-2">{o.payout_method ? PAYOUT_METHOD_LABEL[o.payout_method] : "현금"}</td>
                  <td className="py-2 tabular-nums text-gray-500">{formatKrw(o.cash_paid_amount ?? 0)}</td>
                  <td className="py-2 tabular-nums text-gray-500">{formatKrw(o.purchase_amount ?? 0)}</td>
                  <td className="py-2 font-medium tabular-nums text-gray-800">{formatKrw(o.net_amount ?? 0)}</td>
                  <td className="py-2 text-gray-500">{o.completed_at ? formatRelativeTime(o.completed_at) : "-"}</td>
                </tr>
              ))}
              {(unsettled ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-sm text-gray-400">
                    미정산 주문이 없어요.
                  </td>
                </tr>
              ) : (
                <tr data-testid="dealer-unsettled-total" className="border-t border-gray-200 font-semibold">
                  <td className="py-2" colSpan={4}>
                    포인트 순액 합계 ({(unsettled ?? []).length}건 중 포인트분)
                  </td>
                  <td className="py-2 tabular-nums text-primary">{formatPoint(pointNetSum)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">청구 이력</h2>
        <div className="overflow-x-auto">
          {/* [03 레이아웃 강건성] 표 전체 nowrap 제거 — 글자 확대 시 셀 줄바꿈을 허용한다. */}
          <table className="w-full text-left text-sm" data-testid="dealer-statement-history">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="py-2 font-medium">상태</th>
                <th className="py-2 font-medium">적립</th>
                <th className="py-2 font-medium">차감</th>
                <th className="py-2 font-medium">수수료</th>
                <th className="py-2 font-medium">청구액</th>
                <th className="py-2 font-medium">청구일</th>
                <th className="py-2 font-medium">명세</th>
              </tr>
            </thead>
            <tbody>
              {(settlements ?? []).map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2">
                    {s.status === "SETTLED" ? "정산완료" : s.status === "VOID" ? "무효" : "청구됨"}
                  </td>
                  <td className="py-2 tabular-nums text-gray-700">{formatPoint(s.point_minted)}</td>
                  <td className="py-2 tabular-nums text-gray-500">{formatPoint(s.point_spent)}</td>
                  <td className="py-2 tabular-nums text-gray-500">{formatKrw(s.fee_amount)}</td>
                  <td className="py-2 font-medium tabular-nums text-primary">{formatKrw(s.net_due)}</td>
                  <td className="py-2 text-gray-500">{formatRelativeTime(s.claimed_at)}</td>
                  <td className="py-2">
                    {/* [16 L7] 근거 주문 CSV — RLS로 본인 청구만 조회된다(권한 확대 0). */}
                    <button
                      type="button"
                      data-testid={`statement-csv-${s.id}`}
                      disabled={csvBusy === s.id}
                      onClick={() => void handleCsv(s.id)}
                      className="rounded-button border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                      CSV
                    </button>
                  </td>
                </tr>
              ))}
              {(settlements ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-sm text-gray-400">
                    청구 이력이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-primary"}`}>{value}</p>
    </div>
  );
}

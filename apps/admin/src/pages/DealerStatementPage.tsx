import { formatKrw, formatPoint, formatRelativeTime } from "@oilpick/core";
import { useDealerSettlements, useDealerStatements } from "../hooks/useDealersAdmin";

/**
 * [14 J3]【dealer】 좌상 본인 정산 명세(/statement). v_dealer_statement·dealer_settlements는
 * RLS로 본인 행만 조회된다(읽기 전용 — 계정 설정·청구는 admin이 수행). §5.
 */
export function DealerStatementPage() {
  const { data: statements, isLoading } = useDealerStatements();
  const { data: settlements } = useDealerSettlements();
  const stmt = statements?.[0]; // RLS로 본인 1행

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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="dealer-statement-summary">
          <StatCard label="사용한도" value={formatPoint(stmt.credit_limit)} />
          <StatCard label="미정산 사용액" value={formatPoint(stmt.usage)} accent={stmt.over_threshold} />
          <StatCard label="남은 여유" value={formatPoint(stmt.headroom)} />
          <StatCard label="보증금" value={formatKrw(stmt.deposit_amount)} />
        </div>
      )}

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">청구 이력</h2>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm" data-testid="dealer-statement-history">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="py-2 font-medium">상태</th>
                <th className="py-2 font-medium">적립</th>
                <th className="py-2 font-medium">차감</th>
                <th className="py-2 font-medium">수수료</th>
                <th className="py-2 font-medium">청구액</th>
                <th className="py-2 font-medium">청구일</th>
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
                </tr>
              ))}
              {(settlements ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-sm text-gray-400">
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
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-primary"}`}>{value}</p>
    </div>
  );
}

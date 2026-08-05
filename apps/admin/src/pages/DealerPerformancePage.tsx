import { useMyRiderStats } from "../hooks/useDealerScope";
import { toCsv, downloadCsv } from "../lib/csv";

/** 13 I4【dealer】 실적 통계 — 소속 라이더별 완료·수거kg·지급합·레퍼럴 + CSV. 정산은 좌상 자체(D5). */
export function DealerPerformancePage() {
  const { data: stats, isLoading } = useMyRiderStats();
  const rows = stats ?? [];

  function handleCsv() {
    const csv = toCsv(
      ["라이더", "상태", "완료", "수거kg", "현금지급", "포인트지급", "추천가입", "추천활성"],
      rows.map((r) => [
        r.rider_name ?? r.rider_id.slice(0, 8),
        r.verify_status,
        r.completed_count,
        Number(r.collected_kg).toFixed(1),
        r.cash_paid,
        r.point_paid,
        r.referral_signed_up,
        r.referral_activated,
      ]),
    );
    downloadCsv("좌상_실적", csv);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">소속 라이더 실적</h1>
          <p className="text-sm text-gray-500">지급 금액은 표시용 통계예요. 정산은 좌상이 자체적으로 진행해요.</p>
        </div>
        <button
          type="button"
          data-testid="dealer-perf-csv"
          onClick={handleCsv}
          className="shrink-0 rounded-button border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          CSV 내보내기
        </button>
      </div>

      <div className="overflow-x-auto rounded-card bg-white p-4 shadow-card">
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : rows.length > 0 ? (
          <table className="w-full text-sm" data-testid="dealer-perf-table">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-3 py-2">라이더</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">완료</th>
                <th className="px-3 py-2 text-right">수거kg</th>
                <th className="px-3 py-2 text-right">현금지급</th>
                <th className="px-3 py-2 text-right">포인트지급</th>
                <th className="px-3 py-2 text-right">추천(가입/활성)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rider_id} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{r.rider_name ?? r.rider_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.verify_status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.completed_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.collected_kg).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cash_paid.toLocaleString()}원</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.point_paid.toLocaleString()}P</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.referral_signed_up}/{r.referral_activated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">아직 실적 데이터가 없어요.</p>
        )}
      </div>
    </div>
  );
}

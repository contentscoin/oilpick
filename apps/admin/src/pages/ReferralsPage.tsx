import { formatPoint } from "@oilpick/core";
import {
  useReferralDaily,
  useReferralStatsAdmin,
  type ReferralDailyRow,
  type ReferralStatRow,
} from "../hooks/useReferralAdmin";
import { downloadCsv, toCsv } from "../lib/csv";
import { QueryError } from "../components/QueryError";

/**
 * [09 H4]【A】레퍼럴 실적분석(/referrals). 라이더가 점주에게 앱을 영업하는 성장 루프를 분석한다.
 *  ⓐ 요약 KPI(총 가입/활성화/전환율/지급 보너스 합)
 *  ⓑ 라이더별 퍼널(v_referral_stats — 가입→활성화→전환율 + 보너스/보상) + CSV
 *  ⓒ 일별 추이(v_referral_daily — 일별 가입/당일활성화) + CSV
 * 라이더 보상(rider_reward_earned)은 08 P5 오프라인 정산·청구 근거로만 표기한다(라이더 지갑 없음).
 */
export function ReferralsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">레퍼럴 실적분석</h1>
        <p className="text-sm text-gray-500">라이더별 추천 퍼널과 지급 보너스를 분석해요.</p>
      </div>

      <SummarySection />
      <RiderFunnelSection />
      <DailyTrendSection />
    </div>
  );
}

/** ⓐ 요약 KPI — 전체 합산(라이더 퍼널을 재사용). */
function SummarySection() {
  const { data: rows, isLoading } = useReferralStatsAdmin();

  const totalSignedUp = (rows ?? []).reduce((s, r) => s + r.signedUp, 0);
  const totalActivated = (rows ?? []).reduce((s, r) => s + r.activated, 0);
  const conversion = totalSignedUp > 0 ? Math.round((totalActivated / totalSignedUp) * 100) : 0;
  const totalBonus = (rows ?? []).reduce((s, r) => s + r.supplierBonusPaid, 0);

  const cards = [
    { testId: "kpi-signed-up", label: "총 가입", value: `${totalSignedUp}명` },
    { testId: "kpi-activated", label: "총 활성화", value: `${totalActivated}명` },
    { testId: "kpi-conversion", label: "전환율", value: `${conversion}%` },
    { testId: "kpi-bonus", label: "지급 보너스", value: formatPoint(totalBonus) },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.testId} data-testid={c.testId} className="rounded-card bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">{c.label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
            {isLoading ? "—" : c.value}
          </p>
        </div>
      ))}
    </section>
  );
}

/** ⓑ 라이더별 퍼널 테이블 + CSV. */
function RiderFunnelSection() {
  const { data: rows, isLoading, isError, refetch } = useReferralStatsAdmin();
  const loadFailed = isError && rows === undefined;

  function handleCsv() {
    const csv = toCsv(
      ["라이더", "가입", "활성화", "전환율(%)", "지급 보너스(P)", "추천 보상(정산 대상)"],
      (rows ?? []).map((r: ReferralStatRow) => [
        r.riderName,
        r.signedUp,
        r.activated,
        r.conversion,
        r.supplierBonusPaid,
        r.riderRewardEarned,
      ]),
    );
    downloadCsv("레퍼럴_실적", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">라이더별 추천 퍼널</h2>
          <p className="text-xs text-gray-500">
            추천 보상은 라이더-플랫폼 오프라인 정산·청구의 근거예요(08 P5).
          </p>
        </div>
        <button
          type="button"
          data-testid="referral-csv-button"
          onClick={handleCsv}
          disabled={(rows ?? []).length === 0}
          className="h-9 shrink-0 rounded-button border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          CSV 내보내기
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="referral-funnel-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">라이더</th>
              <th className="py-2 font-medium">가입</th>
              <th className="py-2 font-medium">활성화</th>
              <th className="py-2 font-medium">전환율</th>
              <th className="py-2 font-medium">지급 보너스</th>
              <th className="py-2 font-medium">추천 보상(정산 대상)</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={6} onRetry={refetch} message="추천 실적을 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  아직 추천 실적이 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.riderId} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{r.riderName}</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.signedUp}명</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.activated}명</td>
                  <td className="py-2 tabular-nums text-gray-700">{r.conversion}%</td>
                  <td className="py-2 tabular-nums text-gray-700">{formatPoint(r.supplierBonusPaid)}</td>
                  <td className="py-2 font-semibold tabular-nums text-accent-deep">
                    {formatPoint(r.riderRewardEarned)}
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

/** ⓒ 일별 추이 테이블 + CSV. */
function DailyTrendSection() {
  const { data: rows, isLoading, isError, refetch } = useReferralDaily(30);
  const loadFailed = isError && rows === undefined;

  function handleCsv() {
    const csv = toCsv(
      ["날짜", "가입", "당일 활성화"],
      (rows ?? []).map((r: ReferralDailyRow) => [r.day, r.signedUp, r.activatedSameDay]),
    );
    downloadCsv("레퍼럴_일별추이", csv);
  }

  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">일별 추이 (최근 30일)</h2>
        <button
          type="button"
          data-testid="referral-daily-csv-button"
          onClick={handleCsv}
          disabled={(rows ?? []).length === 0}
          className="h-9 shrink-0 rounded-button border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          CSV 내보내기
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm" data-testid="referral-daily-table">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2 font-medium">날짜</th>
              <th className="py-2 font-medium">가입</th>
              <th className="py-2 font-medium">당일 활성화</th>
            </tr>
          </thead>
          <tbody>
            {loadFailed ? (
              <QueryError colSpan={3} onRetry={refetch} message="일별 추이를 불러오지 못했어요" />
            ) : isLoading ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-gray-500">
                  불러오는 중...
                </td>
              </tr>
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-gray-500">
                  최근 30일 추천 활동이 없어요.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.day} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{r.day}</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.signedUp}명</td>
                  <td className="py-2 tabular-nums text-gray-800">{r.activatedSameDay}명</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

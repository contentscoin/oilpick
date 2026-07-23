import { useMyRiders, useMyRiderStats, useDealerScopeMutations } from "../hooks/useDealerScope";

/** 13 I4【dealer】 관할 대시보드 — 요약 KPI + 소속 라이더 목록 + 승인/해제. */
export function DealerHomePage() {
  const { data: riders, isLoading } = useMyRiders();
  const { data: stats } = useMyRiderStats();
  const { verifyRider, unassign } = useDealerScopeMutations();

  const total = riders?.length ?? 0;
  const approved = riders?.filter((r) => r.verifyStatus === "APPROVED").length ?? 0;
  const pending = riders?.filter((r) => r.verifyStatus === "PENDING").length ?? 0;
  const collectedKg = (stats ?? []).reduce((s, r) => s + Number(r.collected_kg), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">관할 대시보드</h1>
        <p className="text-sm text-gray-500">내 소속 라이더 현황과 실적을 한눈에 확인해요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="dealer-kpi">
        <Kpi label="소속 라이더" value={`${total}명`} />
        <Kpi label="승인 완료" value={`${approved}명`} />
        <Kpi label="승인 대기" value={`${pending}명`} accent />
        <Kpi label="누적 수거" value={`${collectedKg.toFixed(1)}kg`} />
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">소속 라이더</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : riders && riders.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="dealer-rider-list">
            {riders.map((r) => (
              <li
                key={r.id}
                data-testid={`dealer-rider-${r.id}`}
                className="flex flex-col gap-2 rounded-card border border-gray-100 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {r.name}
                    {r.isOnline && <span className="ml-2 rounded-pill bg-primary-light px-2 py-0.5 text-xs text-primary">온라인</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.verifyStatus} · {r.phone ?? "연락처 없음"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.verifyStatus === "PENDING" && (
                    <button
                      type="button"
                      data-testid={`approve-${r.id}`}
                      onClick={() => verifyRider(r.id, "APPROVED")}
                      className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card"
                    >
                      승인
                    </button>
                  )}
                  {r.verifyStatus === "APPROVED" && (
                    <button
                      type="button"
                      data-testid={`suspend-${r.id}`}
                      onClick={() => verifyRider(r.id, "SUSPENDED", "좌상 정지")}
                      className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      정지
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`unassign-${r.id}`}
                    onClick={() => unassign(r.id)}
                    className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
                  >
                    소속 해제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">소속 라이더가 없어요. 본사에 배정을 요청하거나 라이더를 모집해 배정하세요.</p>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-accent-deep" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

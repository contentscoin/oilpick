import { useState } from "react";
import { formatPoint, type PointAdjustOutput } from "@oilpick/core";
import { useAdminRiders, useAdminSuppliers, type AdminSupplierRow } from "../hooks/useUsersAdmin";
import { RiderVerifyCard } from "../components/RiderVerifyCard";
import { QueryError } from "../components/QueryError";
import { invokeEdgeFunction } from "../lib/edgeFunction";

type Tab = "supplier" | "rider";

/**
 * 03-frontend.md apps/admin "/users" + 08 G7-⑤ 개정:
 * - 라이더탭: RiderCouponPanel(쿠폰 잔액/수동 조정) 제거 — 쿠폰 모델 폐기(08 P1).
 *   라이더별 지급 실적은 /settlement "라이더별 지급 실적" 표에서 본다(정산 근거 단일화, 08 P5).
 * - 공급업체탭: [포인트 조정](point-adjust — amount ± 정수, memo 필수) 모달 추가.
 *   CS 보정용 수동 조정 — 원장 기록(ADJUST)은 서버 RPC(fn_post_ledger)가 담당(절대 규칙 1).
 */
export function UsersPage() {
  const [tab, setTab] = useState<Tab>("rider");
  const [riderFilter, setRiderFilter] = useState<"PENDING" | "ALL">("PENDING");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
        <p className="text-sm text-gray-500">공급업체와 라이더 계정을 관리해요.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("supplier")}
          className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors ${tab === "supplier" ? "bg-primary text-white shadow-card" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"}`}
          data-testid="tab-supplier"
        >
          공급업체
        </button>
        <button
          type="button"
          onClick={() => setTab("rider")}
          className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors ${tab === "rider" ? "bg-primary text-white shadow-card" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"}`}
          data-testid="tab-rider"
        >
          라이더
        </button>
      </div>

      {tab === "supplier" ? (
        <SupplierTable />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRiderFilter("PENDING")}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${riderFilter === "PENDING" ? "bg-accent text-white shadow-card" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"}`}
              data-testid="rider-filter-pending"
            >
              승인 대기
            </button>
            <button
              type="button"
              onClick={() => setRiderFilter("ALL")}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${riderFilter === "ALL" ? "bg-primary text-white shadow-card" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"}`}
              data-testid="rider-filter-all"
            >
              전체
            </button>
          </div>
          <RiderList statusFilter={riderFilter} />
        </div>
      )}
    </div>
  );
}

function SupplierTable() {
  const { data: suppliers, isLoading, isError, refetch } = useAdminSuppliers();
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && suppliers === undefined;
  const [adjustTarget, setAdjustTarget] = useState<AdminSupplierRow | null>(null);

  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="w-full whitespace-nowrap text-left text-sm" data-testid="suppliers-table">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <th className="px-4 py-3 font-medium">상호</th>
            <th className="px-4 py-3 font-medium">담당자</th>
            <th className="px-4 py-3 font-medium">사업자번호</th>
            <th className="px-4 py-3 font-medium">주소</th>
            <th className="px-4 py-3 font-medium">전화</th>
            <th className="px-4 py-3 font-medium">가입일</th>
            <th className="px-4 py-3 font-medium">포인트</th>
          </tr>
        </thead>
        <tbody>
          {loadFailed ? (
            <QueryError colSpan={7} onRetry={refetch} message="공급업체 목록을 불러오지 못했어요" />
          ) : isLoading ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                불러오는 중...
              </td>
            </tr>
          ) : suppliers && suppliers.length > 0 ? (
            suppliers.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.storeName}</td>
                <td className="px-4 py-3 text-gray-800">{s.displayName}</td>
                <td className="px-4 py-3 tabular-nums text-gray-800">{s.bizNumber}</td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-600">{s.address}</td>
                <td className="px-4 py-3 tabular-nums text-gray-800">{s.phone}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAdjustTarget(s)}
                    className="h-8 rounded-button border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    data-testid={`point-adjust-open-${s.id}`}
                  >
                    포인트 조정
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                등록된 공급업체가 없어요.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adjustTarget && <PointAdjustModal supplier={adjustTarget} onClose={() => setAdjustTarget(null)} />}
    </div>
  );
}

/**
 * 08 G7-⑤: 포인트 수동 조정 모달 — point-adjust Edge Function(fn_post_ledger ADJUST).
 * amount는 ± 정수(0 불가), memo 필수(원장 감사 추적용 — /settlement 포인트 원장에 남는다).
 */
function PointAdjustModal({ supplier, onClose }: { supplier: AdminSupplierRow; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum === 0) {
      setError("조정 금액은 0이 아닌 정수(±)로 입력해주세요.");
      return;
    }
    const trimmedMemo = memo.trim();
    if (!trimmedMemo) {
      setError("조정 사유(memo)를 입력해주세요.");
      return;
    }
    setBusy(true);
    const result = await invokeEdgeFunction<PointAdjustOutput>("point-adjust", {
      userId: supplier.id,
      amount: amountNum,
      memo: trimmedMemo,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess(`${supplier.storeName}에 ${formatPoint(Math.abs(result.data.amount))}를 ${result.data.amount > 0 ? "지급" : "회수"}했어요.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="point-adjust-modal">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card">
        <h3 className="text-lg font-semibold text-gray-900">포인트 조정 — {supplier.storeName}</h3>
        <p className="mt-1 text-xs text-gray-500">
          CS 보정용 수동 조정이에요. 기록은 포인트 원장(ADJUST)에 남고 되돌릴 수 없어요(append-only).
        </p>

        {success ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-primary" data-testid="point-adjust-success">
              {success}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-button bg-primary px-4 text-sm font-semibold text-white"
              data-testid="point-adjust-close"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <input
              type="number"
              step="1"
              placeholder="금액(P, ± 정수 — 예: 5000 / -3000)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
              data-testid="point-adjust-amount"
            />
            <input
              type="text"
              placeholder="조정 사유(필수)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
              data-testid="point-adjust-memo"
            />
            {error && (
              <p className="text-sm font-medium text-status-danger" data-testid="point-adjust-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="h-10 flex-1 rounded-button bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
                data-testid="point-adjust-submit"
              >
                조정 실행
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-button border border-gray-200 px-4 text-sm font-medium text-gray-600"
                data-testid="point-adjust-cancel"
              >
                취소
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RiderList({ statusFilter }: { statusFilter: "PENDING" | "ALL" }) {
  const { data: riders, isLoading, isError, refetch } = useAdminRiders(statusFilter);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && riders === undefined;

  // 빈 상태 분기보다 먼저 — 쿼리 실패가 "0건"으로 위장되지 않게 한다.
  if (loadFailed) {
    return (
      <div className="rounded-card bg-white p-4 shadow-card">
        <QueryError onRetry={refetch} message="라이더 목록을 불러오지 못했어요" />
      </div>
    );
  }
  if (isLoading) return <p className="text-sm text-gray-500">불러오는 중...</p>;
  if (!riders || riders.length === 0) {
    return (
      <div className="rounded-card bg-white p-8 text-center text-sm text-gray-500 shadow-card">
        해당 조건의 라이더가 없어요.
      </div>
    );
  }

  // 08 G7-⑤: 쿠폰 패널(footer) 제거 — 라이더별 지급 실적은 /settlement에서 확인.
  return (
    <div className="flex flex-col gap-4" data-testid="rider-list">
      {riders.map((rider) => (
        <RiderVerifyCard key={rider.id} rider={rider} onProcessed={refetch} />
      ))}
    </div>
  );
}

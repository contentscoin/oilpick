import { useState } from "react";
import { useAdminRiders, useAdminSuppliers } from "../hooks/useUsersAdmin";
import { RiderVerifyCard } from "../components/RiderVerifyCard";

type Tab = "supplier" | "rider";

/**
 * 03-frontend.md apps/admin "/users": "supplier/rider 탭. rider PENDING 큐: 서류 이미지 뷰어 +
 * 승인/반려(rider-verify)".
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
  const { data: suppliers, isLoading } = useAdminSuppliers();
  return (
    <div className="overflow-hidden rounded-card bg-white shadow-card">
      <table className="w-full text-left text-sm" data-testid="suppliers-table">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <th className="px-4 py-3 font-medium">상호</th>
            <th className="px-4 py-3 font-medium">담당자</th>
            <th className="px-4 py-3 font-medium">사업자번호</th>
            <th className="px-4 py-3 font-medium">주소</th>
            <th className="px-4 py-3 font-medium">전화</th>
            <th className="px-4 py-3 font-medium">가입일</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
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
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                등록된 공급업체가 없어요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RiderList({ statusFilter }: { statusFilter: "PENDING" | "ALL" }) {
  const { data: riders, isLoading, refetch } = useAdminRiders(statusFilter);

  if (isLoading) return <p className="text-sm text-gray-400">불러오는 중...</p>;
  if (!riders || riders.length === 0) {
    return (
      <div className="rounded-card bg-white p-8 text-center text-sm text-gray-400 shadow-card">
        해당 조건의 라이더가 없어요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="rider-list">
      {riders.map((rider) => (
        <RiderVerifyCard key={rider.id} rider={rider} onProcessed={refetch} />
      ))}
    </div>
  );
}

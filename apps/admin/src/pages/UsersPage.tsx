import { useMemo, useState } from "react";
import { formatPoint, type PointAdjustOutput } from "@oilpick/core";
import {
  useAdminRiders,
  useAdminSuppliers,
  useCouponBalances,
  usePointBalances,
  type AdminRiderRow,
  type AdminSupplierRow,
} from "../hooks/useUsersAdmin";
import { RiderVerifyCard } from "../components/RiderVerifyCard";
import { RiderCouponPanel } from "../components/RiderCouponPanel";
import { UserDetailDrawer } from "../components/UserDetailDrawer";
import { QueryError } from "../components/QueryError";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  StatCard,
  TableMessageRow,
  TableShell,
  Tabs,
  TextInput,
} from "../components/ui";

type Tab = "supplier" | "rider";

/**
 * 03-frontend.md apps/admin "/users" + 08 G7-⑤ + [17 Q4] + [19 T4] 개정:
 * - 공급업체탭: 검색(상호/담당자/사업자번호/전화) + 요약 KPI + 행 클릭 상세 드로어
 *   (기본정보·포인트 잔액·최근 주문 10건·정보수정) + [포인트 조정](point-adjust) 모달.
 * - 라이더탭: 검색(이름/차량번호/전화/소속 좌상) + 승인 큐 필터 + 승인 카드(RiderVerifyCard) +
 *   쿠폰 패널(17 Q4) + 상세 드로어(소속 좌상·지급 한도·정보수정 — 19 T4 신규 연결).
 * - 정보수정은 user-update Edge만 경유한다(profiles는 admin 직접 update가 RLS로 막힌다 — 19 §0).
 * - 원장 쓰기는 전부 Edge Function(절대 규칙 1) — 화면은 조회 + 요청만 한다.
 */
export function UsersPage() {
  const [tab, setTab] = useState<Tab>("rider");
  const [riderFilter, setRiderFilter] = useState<"PENDING" | "ALL">("PENDING");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="회원 관리" description="공급업체와 라이더 계정을 관리해요." />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "supplier", label: "공급업체", testId: "tab-supplier" },
          { value: "rider", label: "라이더", testId: "tab-rider" },
        ]}
      />

      {tab === "supplier" ? (
        <SupplierTable />
      ) : (
        <div className="flex flex-col gap-4">
          <Tabs
            size="sm"
            value={riderFilter}
            onChange={setRiderFilter}
            items={[
              { value: "PENDING", label: "승인 대기", testId: "rider-filter-pending" },
              { value: "ALL", label: "전체", testId: "rider-filter-all" },
            ]}
          />
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
  const { data: balances } = usePointBalances();
  const [adjustTarget, setAdjustTarget] = useState<AdminSupplierRow | null>(null);
  const [detail, setDetail] = useState<AdminSupplierRow | null>(null);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return suppliers ?? [];
    return (suppliers ?? []).filter((s) =>
      [s.storeName, s.displayName, s.bizNumber, s.phone, s.address].some((v) => (v ?? "").toLowerCase().includes(k)),
    );
  }, [suppliers, keyword]);

  // 포인트 잔액 총합은 회사가 지고 있는 미출금 부채 규모 — 목록 위에서 바로 읽히게 둔다.
  const totalPoint = useMemo(
    () => (suppliers ?? []).reduce((sum, s) => sum + (balances?.get(s.id) ?? 0), 0),
    [suppliers, balances],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="공급업체" value={`${suppliers?.length ?? 0}곳`} data-testid="supplier-kpi-count" />
        <StatCard
          label="검색 결과"
          value={`${filtered.length}곳`}
          sub={keyword ? `"${keyword}"` : "전체"}
          data-testid="supplier-kpi-filtered"
        />
        <StatCard
          label="포인트 잔액 합계"
          value={formatPoint(totalPoint)}
          sub="미출금 포인트 부채"
          tone="accent"
          data-testid="supplier-kpi-point"
        />
      </div>

      <SearchInput
        value={keyword}
        onValueChange={setKeyword}
        label="공급업체 검색 (상호·담당자·사업자번호·전화·주소)"
        className="w-full sm:w-96"
        data-testid="supplier-search"
      />

      <TableShell
        headers={["상호", "담당자", "사업자번호", "주소", "전화", "포인트", "가입일", ""]}
        data-testid="suppliers-table"
      >
        {loadFailed ? (
          <QueryError colSpan={8} onRetry={refetch} message="공급업체 목록을 불러오지 못했어요" />
        ) : isLoading ? (
          <TableMessageRow colSpan={8}>불러오는 중...</TableMessageRow>
        ) : filtered.length > 0 ? (
          filtered.map((s) => (
            <tr key={s.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">
                <button
                  type="button"
                  onClick={() => setDetail(s)}
                  className="text-left text-primary underline underline-offset-2"
                  data-testid={`supplier-open-${s.id}`}
                >
                  {s.storeName}
                </button>
              </td>
              <td className="px-4 py-3 text-gray-800">{s.displayName}</td>
              <td className="px-4 py-3 tabular-nums text-gray-800">{s.bizNumber}</td>
              {/* [03 레이아웃 강건성] table-layout:auto에선 td의 max-w가 무시된다 — 셀 안쪽 div로 자른다. */}
              <td className="px-4 py-3 text-gray-600">
                <div className="max-w-xs truncate">{s.address}</div>
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-800">{s.phone}</td>
              <td className="px-4 py-3 tabular-nums text-accent-deep" data-testid={`supplier-point-${s.id}`}>
                {balances ? formatPoint(balances.get(s.id) ?? 0) : "-"}
              </td>
              <td className="px-4 py-3 text-gray-500">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</td>
              <td className="px-4 py-3">
                <Button size="sm" onClick={() => setAdjustTarget(s)} data-testid={`point-adjust-open-${s.id}`}>
                  포인트 조정
                </Button>
              </td>
            </tr>
          ))
        ) : (
          <TableMessageRow colSpan={8}>
            {keyword ? "조건에 맞는 공급업체가 없어요." : "등록된 공급업체가 없어요."}
          </TableMessageRow>
        )}
      </TableShell>

      {adjustTarget && <PointAdjustModal supplier={adjustTarget} onClose={() => setAdjustTarget(null)} />}
      {detail && (
        <UserDetailDrawer
          supplier={detail}
          pointBalance={balances?.get(detail.id) ?? 0}
          onClose={() => setDetail(null)}
        />
      )}
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
            <Button variant="primary" onClick={onClose} data-testid="point-adjust-close">
              닫기
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <Field label="금액(P, ± 정수)" hint="예: 5000 / -3000">
              <TextInput
                type="number"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="point-adjust-amount"
              />
            </Field>
            <Field label="조정 사유(필수)">
              <TextInput
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                data-testid="point-adjust-memo"
              />
            </Field>
            {error && (
              <p className="text-sm font-medium text-status-danger" data-testid="point-adjust-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy} className="flex-1" data-testid="point-adjust-submit">
                조정 실행
              </Button>
              <Button onClick={onClose} data-testid="point-adjust-cancel">
                취소
              </Button>
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
  const { data: balances, refetch: refetchBalances } = useCouponBalances();
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<AdminRiderRow | null>(null);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return riders ?? [];
    return (riders ?? []).filter((r) =>
      [r.displayName, r.vehicleNumber, r.phone, r.dealerName ?? "", r.bizNumber].some((v) =>
        (v ?? "").toLowerCase().includes(k),
      ),
    );
  }, [riders, keyword]);

  const online = (riders ?? []).filter((r) => r.isOnline).length;
  const unassigned = (riders ?? []).filter((r) => r.dealerId == null).length;

  // 빈 상태 분기보다 먼저 — 쿼리 실패가 "0건"으로 위장되지 않게 한다.
  if (loadFailed) {
    return (
      <div className="rounded-card bg-white p-4 shadow-card">
        <QueryError onRetry={refetch} message="라이더 목록을 불러오지 못했어요" />
      </div>
    );
  }
  if (isLoading) return <p className="text-sm text-gray-500">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={statusFilter === "PENDING" ? "승인 대기" : "라이더"} value={`${riders?.length ?? 0}명`} data-testid="rider-kpi-count" />
        <StatCard label="온라인" value={`${online}명`} data-testid="rider-kpi-online" />
        {/* 미배정은 본사 직속 = 좌상 크레딧 게이트 밖 — 조직 온보딩 누락을 목록 위에서 드러낸다. */}
        <StatCard label="소속 미배정" value={`${unassigned}명`} tone={unassigned > 0 ? "danger" : "neutral"} data-testid="rider-kpi-unassigned" />
      </div>

      <SearchInput
        value={keyword}
        onValueChange={setKeyword}
        label="라이더 검색 (이름·차량번호·전화·소속 좌상)"
        className="w-full sm:w-96"
        data-testid="rider-search"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={keyword ? "조건에 맞는 라이더가 없어요." : "해당 조건의 라이더가 없어요."}
          description={keyword ? "검색어를 지우면 전체 목록으로 돌아가요." : undefined}
          data-testid="rider-empty"
        />
      ) : (
        // [17 Q4] 쿠폰 패널(footer) — 잔액·조정·환불은 라이더 카드 안에서 닫는다.
        <div className="flex flex-col gap-4" data-testid="rider-list">
          {filtered.map((rider) => (
            <div key={rider.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* [19 T4] 소속 좌상 배지 — 회원 관리에서 조직 귀속이 안 보이던 누락 연결. */}
                <Badge tone={rider.dealerId ? "primary" : "neutral"} data-testid={`rider-dealer-${rider.id}`}>
                  {rider.dealerName ?? "본사 직속"}
                </Badge>
                <Button size="sm" onClick={() => setDetail(rider)} data-testid={`rider-open-${rider.id}`}>
                  상세·정보수정
                </Button>
              </div>
              <RiderVerifyCard
                rider={rider}
                onProcessed={refetch}
                footer={
                  <RiderCouponPanel
                    riderId={rider.id}
                    riderName={rider.displayName}
                    // 원장 행이 없는 라이더는 뷰에 행이 없음 = 잔액 0 (17 C4 — 잔액은 뷰로만).
                    balance={balances ? (balances.get(rider.id) ?? 0) : undefined}
                    onChanged={() => {
                      refetchBalances();
                    }}
                  />
                }
              />
            </div>
          ))}
        </div>
      )}

      {detail && (
        <UserDetailDrawer
          rider={detail}
          couponBalance={balances?.get(detail.id) ?? 0}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

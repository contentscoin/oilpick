import { useMemo, useState } from "react";
import {
  useAssignableRiders,
  useDealerMutations,
  useDealerStatements,
  useDealers,
  type DealerRow,
} from "../hooks/useDealersAdmin";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Gauge,
  PageHeader,
  SearchInput,
  StatCard,
  Tabs,
  TextInput,
} from "../components/ui";

/**
 * 13 I3【admin】 좌상 관리 — 좌상 계정 생성·수정(아이디/비밀번호/상호/연락처) + 라이더 소속 배정.
 * [19 T5] 고도화: 좌상 목록을 카드로 승격해 **소속 라이더 수·배분 모드·한도 게이지·미청구
 * 사용액**을 한 화면에서 읽게 한다(19 §0 "조직 관제 정보 부족"). 라이더 배정에는 검색+소속
 * 필터를 붙였다. 크레딧 값의 진실은 v_dealer_statement(14 J3) — 여기서는 조회만 한다.
 */
export function DealersPage() {
  const { data: dealers, isLoading } = useDealers();
  const { data: riders } = useAssignableRiders();
  const { data: statements } = useDealerStatements();
  const { createDealer, assignRider, updateDealer } = useDealerMutations();

  // [18 R8] creditLimit — 입력하면 좌상 생성과 동시에 크레딧 계정이 만들어져 한도 게이트가 켜진다.
  // 비우면 계정 행이 없어 게이트가 통째로 건너뛰어지므로(무제한) 목록에 경고 배지가 뜬다.
  const [form, setForm] = useState({ username: "", password: "", displayName: "", phone: "", creditLimit: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // 좌상별 소속 라이더 집계 — 별도 쿼리 없이 배정 목록에서 파생한다.
  const riderCounts = useMemo(() => {
    const map = new Map<string, { total: number; approved: number; pending: number }>();
    for (const r of riders ?? []) {
      if (!r.dealerId) continue;
      const cur = map.get(r.dealerId) ?? { total: 0, approved: 0, pending: 0 };
      cur.total += 1;
      if (r.verifyStatus === "APPROVED") cur.approved += 1;
      if (r.verifyStatus === "PENDING") cur.pending += 1;
      map.set(r.dealerId, cur);
    }
    return map;
  }, [riders]);

  const statementMap = useMemo(
    () => new Map((statements ?? []).map((s) => [s.dealer_id, s])),
    [statements],
  );

  async function handleCreate() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { creditLimit, ...rest } = form;
    const parsedLimit = creditLimit.trim() === "" ? undefined : Number(creditLimit);
    if (parsedLimit != null && (!Number.isInteger(parsedLimit) || parsedLimit < 0)) {
      setBusy(false);
      setError("초기 한도는 0 이상의 정수로 입력해주세요.");
      return;
    }
    const result = await createDealer({ ...rest, ...(parsedLimit != null ? { creditLimit: parsedLimit } : {}) });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(
      parsedLimit != null
        ? `좌상 '${form.displayName}' 계정을 만들었어요(초기 한도 ${parsedLimit.toLocaleString()}P).`
        : `좌상 '${form.displayName}' 계정을 만들었어요. 한도가 없으면 사용 제한이 적용되지 않아요 — 정산 화면에서 등록하세요.`,
    );
    setForm({ username: "", password: "", displayName: "", phone: "", creditLimit: "" });
  }

  const canSubmit = form.username.length >= 3 && form.password.length >= 8 && form.displayName.trim().length > 0;

  const noAccountCount = (dealers ?? []).filter((d) => !d.hasAccount).length;
  const totalUsage = (statements ?? []).reduce((sum, s) => sum + s.usage, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="좌상 관리"
        description="좌상(서브어드민) 계정을 만들고 라이더 소속과 크레딧 현황을 관리해요."
        actions={
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)} data-testid="dealer-create-toggle">
            {showCreate ? "닫기" : "좌상 계정 생성"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="좌상" value={`${dealers?.length ?? 0}곳`} data-testid="dealer-kpi-count" />
        <StatCard
          label="한도 미설정"
          value={`${noAccountCount}곳`}
          sub={noAccountCount > 0 ? "크레딧 게이트 미적용" : "전 좌상 한도 등록됨"}
          tone={noAccountCount > 0 ? "danger" : "neutral"}
          data-testid="dealer-kpi-no-account"
        />
        <StatCard
          label="미청구 사용액 합계"
          value={`${totalUsage.toLocaleString()}P`}
          sub="정산 청구 전 POINT 순액"
          tone="accent"
          data-testid="dealer-kpi-usage"
        />
      </div>

      {/* 좌상 생성 — 상시 노출하면 목록보다 위에서 화면을 먹는다. 기본 접힘. */}
      {showCreate && (
        <Card title="좌상 계정 생성">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="아이디" hint="영소문자·숫자·밑줄, 3자 이상">
              <TextInput
                data-testid="dealer-username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </Field>
            <Field label="비밀번호" hint="8자 이상">
              <TextInput
                data-testid="dealer-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Field>
            <Field label="상호/이름">
              <TextInput
                data-testid="dealer-name"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </Field>
            <Field label="연락처">
              <TextInput
                data-testid="dealer-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            {/* [18 R8] 초기 사용한도(선택) — 비우면 크레딧 계정이 없어 한도 제한이 적용되지 않는다. */}
            <Field label="초기 사용한도(P, 선택)" hint="비우면 무제한 — 정산 화면에서 나중에 등록할 수 있어요.">
              <TextInput
                data-testid="dealer-credit-limit"
                inputMode="numeric"
                className="tabular-nums"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />
            </Field>
          </div>
          {error && (
            <p data-testid="dealer-error" className="mt-3 text-sm text-status-danger">
              {error}
            </p>
          )}
          {notice && (
            <p data-testid="dealer-notice" className="mt-3 text-sm text-primary">
              {notice}
            </p>
          )}
          <Button
            variant="primary"
            data-testid="dealer-create-button"
            disabled={!canSubmit || busy}
            onClick={handleCreate}
            className="mt-4"
          >
            {busy ? "생성 중…" : "좌상 생성"}
          </Button>
        </Card>
      )}

      {/* 좌상 목록 */}
      <Card title={`좌상 목록 (${dealers?.length ?? 0})`}>
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : dealers && dealers.length > 0 ? (
          <ul className="flex flex-col gap-3" data-testid="dealer-list">
            {dealers.map((d) => (
              <DealerListItem
                key={d.id}
                dealer={d}
                counts={riderCounts.get(d.id)}
                statement={statementMap.get(d.id)}
                onUpdate={updateDealer}
              />
            ))}
          </ul>
        ) : (
          <EmptyState title="등록된 좌상이 없어요." description="상단 [좌상 계정 생성]으로 첫 좌상을 만들어보세요." />
        )}
      </Card>

      <RiderAssignSection dealers={dealers ?? []} riders={riders ?? []} onAssign={assignRider} />
    </div>
  );
}

interface DealerStatementLike {
  credit_limit: number;
  usage: number;
  headroom: number;
  unsettled_order_count: number;
  over_threshold: boolean;
}

/**
 * 좌상 카드 + 인라인 수정 폼(13 I2 보강, CEO 2026-08-06 "좌상 정보수정").
 * [수정]을 열면 아이디/새 비밀번호/상호/연락처 입력 — 비워둔 항목은 변경하지 않는다(부분 수정).
 * 아이디 변경은 로그인 email(<아이디>@oilpick.local) 재매핑, 비밀번호는 관리자 재설정이라
 * 현재 비밀번호 없이 즉시 반영된다(dealer-update Edge).
 * [19 T5] 소속 라이더 수·배분 모드·한도 게이지·미청구 사용액을 카드 본문에 연결했다.
 */
function DealerListItem({
  dealer,
  counts,
  statement,
  onUpdate,
}: {
  dealer: DealerRow;
  counts?: { total: number; approved: number; pending: number };
  statement?: DealerStatementLike;
  onUpdate: (input: {
    dealerId: string;
    username?: string;
    password?: string;
    displayName?: string;
    phone?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openEdit() {
    setForm({ username: "", password: "", displayName: dealer.displayName, phone: dealer.phone });
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    const username = form.username.trim() || undefined;
    const password = form.password || undefined;
    const displayName = form.displayName.trim() && form.displayName.trim() !== dealer.displayName ? form.displayName.trim() : undefined;
    const phone = form.phone.trim() && form.phone.trim() !== dealer.phone ? form.phone.trim() : undefined;
    if (!username && !password && !displayName && !phone) {
      setError("수정할 항목을 하나 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    const result = await onUpdate({ dealerId: dealer.id, username, password, displayName, phone });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "수정에 실패했어요.");
      return;
    }
    setNotice("수정했어요. 변경한 아이디/비밀번호로 다시 로그인해야 해요.");
    setEditing(false);
  }

  return (
    <li className="rounded-card border border-gray-100 p-3 text-sm" data-testid={`dealer-item-${dealer.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
            <span className="min-w-0">{dealer.displayName}</span>
            <Badge tone={dealer.allocationMode === "PER_RIDER" ? "accent" : "neutral"} data-testid={`dealer-mode-${dealer.id}`}>
              {dealer.allocationMode === "PER_RIDER" ? "라이더별 배분" : "총량 공유"}
            </Badge>
            {/* [18 R8·X1] 크레딧 계정 미등록 = 게이트 미적용(무제한 POINT 발행). 온보딩 누락을 가시화한다.
                (톤 클래스는 status-danger — 프리셋에 top-level `danger` 색이 없어 예전 표기는 죽어 있었다.) */}
            {!dealer.hasAccount && (
              <Badge
                tone="danger"
                data-testid={`dealer-no-account-${dealer.id}`}
                title="크레딧 계정이 없어 사용한도 제한이 적용되지 않아요. 정산 화면에서 한도를 등록하세요."
              >
                한도 미설정
              </Badge>
            )}
            {statement?.over_threshold && (
              <Badge tone="warning" data-testid={`dealer-threshold-${dealer.id}`}>
                청구 임계 초과
              </Badge>
            )}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span>{dealer.phone || "연락처 없음"}</span>
            <span data-testid={`dealer-riders-${dealer.id}`}>
              소속 {counts?.total ?? 0}명
              {counts && counts.pending > 0 && ` (대기 ${counts.pending})`}
            </span>
            {statement && <span>미정산 {statement.unsettled_order_count}건</span>}
          </p>
        </div>
        <Button
          size="sm"
          data-testid={`dealer-edit-button-${dealer.id}`}
          onClick={() => (editing ? setEditing(false) : openEdit())}
        >
          {editing ? "닫기" : "수정"}
        </Button>
      </div>

      {/* 한도 게이지 — 좌상 콘솔·라이더 앱과 같은 시각 언어(18). 계정이 없으면 게이지 자체가 없다. */}
      {statement && (
        <div className="mt-2" data-testid={`dealer-gauge-${dealer.id}`}>
          <Gauge
            used={statement.usage}
            limit={statement.credit_limit}
            label={
              <>
                <span>
                  사용 {statement.usage.toLocaleString()}P / 한도 {statement.credit_limit.toLocaleString()}P
                </span>
                <span className="tabular-nums">잔여 {statement.headroom.toLocaleString()}P</span>
              </>
            }
          />
        </div>
      )}

      {notice && !editing && (
        <p data-testid={`dealer-update-notice-${dealer.id}`} className="mt-2 text-xs text-primary">
          {notice}
        </p>
      )}
      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="새 아이디" hint="비우면 유지">
              <TextInput
                data-testid={`dealer-edit-username-${dealer.id}`}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </Field>
            <Field label="새 비밀번호" hint="비우면 유지, 8자 이상">
              <TextInput
                data-testid={`dealer-edit-password-${dealer.id}`}
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Field>
            <Field label="상호/이름">
              <TextInput
                data-testid={`dealer-edit-name-${dealer.id}`}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </Field>
            <Field label="연락처">
              <TextInput
                data-testid={`dealer-edit-phone-${dealer.id}`}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
          </div>
          {error && (
            <p data-testid={`dealer-update-error-${dealer.id}`} className="text-xs text-status-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            size="sm"
            data-testid={`dealer-update-save-${dealer.id}`}
            disabled={busy || (form.password.length > 0 && form.password.length < 8)}
            onClick={handleSave}
            className="self-start"
          >
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      )}
    </li>
  );
}

type AssignFilter = "ALL" | "UNASSIGNED";

/** [19 T5] 라이더 소속 배정 — 검색 + 미배정 필터. 라이더가 늘면 평면 목록은 못 쓴다. */
function RiderAssignSection({
  dealers,
  riders,
  onAssign,
}: {
  dealers: DealerRow[];
  riders: Array<{ id: string; name: string; verifyStatus: string; dealerId: string | null; dealerName: string | null }>;
  onAssign: (riderId: string, dealerId: string | null) => Promise<unknown>;
}) {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<AssignFilter>("ALL");

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return riders.filter((r) => {
      if (filter === "UNASSIGNED" && r.dealerId) return false;
      if (!k) return true;
      return [r.name, r.dealerName ?? "", r.verifyStatus].some((v) => v.toLowerCase().includes(k));
    });
  }, [riders, keyword, filter]);

  return (
    <Card
      title="라이더 소속 배정"
      description="소속을 바꾸면 이후 수락하는 주문부터 새 좌상에 귀속돼요(기존 주문의 귀속은 수락 시점 스냅샷 그대로예요)."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onValueChange={setKeyword}
          label="라이더 검색 (이름·소속)"
          className="w-full sm:w-72"
          data-testid="assign-search"
        />
        <Tabs
          size="sm"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "ALL", label: "전체", testId: "assign-filter-all" },
            { value: "UNASSIGNED", label: "미배정만", testId: "assign-filter-unassigned" },
          ]}
        />
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="assign-rider-list">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-gray-100 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{r.name}</p>
                <p className="text-xs text-gray-500">
                  {r.verifyStatus} · 소속: {r.dealerName ?? "미배정(본사 직속)"}
                </p>
              </div>
              <select
                data-testid={`assign-select-${r.id}`}
                value={r.dealerId ?? ""}
                onChange={(e) => onAssign(r.id, e.target.value || null)}
                className="min-h-9 rounded-button border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="">미배정</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.displayName}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={keyword || filter === "UNASSIGNED" ? "조건에 맞는 라이더가 없어요." : "배정할 라이더가 없어요."}
          data-testid="assign-empty"
        />
      )}
    </Card>
  );
}

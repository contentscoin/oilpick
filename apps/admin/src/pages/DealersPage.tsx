import { useState } from "react";
import { useDealers, useAssignableRiders, useDealerMutations, type DealerRow } from "../hooks/useDealersAdmin";

/** 13 I3【admin】 좌상 관리 — 좌상 계정 생성·수정(아이디/비밀번호/상호/연락처) + 라이더 소속 배정. */
export function DealersPage() {
  const { data: dealers, isLoading } = useDealers();
  const { data: riders } = useAssignableRiders();
  const { createDealer, assignRider, updateDealer } = useDealerMutations();

  const [form, setForm] = useState({ username: "", password: "", displayName: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await createDealer(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(`좌상 '${form.displayName}' 계정을 만들었어요.`);
    setForm({ username: "", password: "", displayName: "", phone: "" });
  }

  const canSubmit = form.username.length >= 3 && form.password.length >= 8 && form.displayName.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">좌상 관리</h1>
        <p className="text-sm text-gray-500">좌상(서브어드민) 계정을 만들고 라이더 소속을 배정해요.</p>
      </div>

      {/* 좌상 생성 */}
      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">좌상 계정 생성</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            data-testid="dealer-username"
            placeholder="아이디(영소문자·숫자·_)"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            data-testid="dealer-password"
            type="password"
            placeholder="비밀번호(8자 이상)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            data-testid="dealer-name"
            placeholder="상호/이름"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            data-testid="dealer-phone"
            placeholder="연락처"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        {error && <p data-testid="dealer-error" className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p data-testid="dealer-notice" className="mt-3 text-sm text-primary">{notice}</p>}
        <button
          type="button"
          data-testid="dealer-create-button"
          disabled={!canSubmit || busy}
          onClick={handleCreate}
          className="mt-4 rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-50"
        >
          {busy ? "생성 중…" : "좌상 생성"}
        </button>
      </div>

      {/* 좌상 목록 */}
      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">좌상 목록 ({dealers?.length ?? 0})</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : dealers && dealers.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="dealer-list">
            {dealers.map((d) => (
              <DealerListItem key={d.id} dealer={d} onUpdate={updateDealer} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">등록된 좌상이 없어요.</p>
        )}
      </div>

      {/* 라이더 배정 */}
      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">라이더 소속 배정</h2>
        {riders && riders.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="assign-rider-list">
            {riders.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-gray-100 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {r.verifyStatus} · 소속: {r.dealerName ?? "미배정(본사 직속)"}
                  </p>
                </div>
                <select
                  data-testid={`assign-select-${r.id}`}
                  value={r.dealerId ?? ""}
                  onChange={(e) => assignRider(r.id, e.target.value || null)}
                  className="rounded-button border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="">미배정</option>
                  {(dealers ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">배정할 라이더가 없어요.</p>
        )}
      </div>
    </div>
  );
}

/**
 * 좌상 목록 행 + 인라인 수정 폼(13 I2 보강, CEO 2026-08-06 "좌상 정보수정 — 아이디·비번").
 * [수정]을 열면 아이디/새 비밀번호/상호/연락처 입력 — 비워둔 항목은 변경하지 않는다(부분 수정).
 * 아이디 변경은 로그인 email(<아이디>@oilpick.local) 재매핑, 비밀번호는 관리자 재설정이라
 * 현재 비밀번호 없이 즉시 반영된다(dealer-update Edge).
 */
function DealerListItem({
  dealer,
  onUpdate,
}: {
  dealer: DealerRow;
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
    <li className="rounded-card border border-gray-100 px-3 py-2 text-sm" data-testid={`dealer-item-${dealer.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-medium text-gray-800">
          {dealer.displayName}
          {/* [18 R8·X1] 크레딧 계정 미등록 = 게이트 미적용(무제한 POINT 발행). 온보딩 누락을 가시화한다. */}
          {!dealer.hasAccount && (
            <span
              data-testid={`dealer-no-account-${dealer.id}`}
              title="크레딧 계정이 없어 사용한도 제한이 적용되지 않아요. 정산 화면에서 한도를 등록하세요."
              className="ml-2 rounded-pill bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger"
            >
              한도 미설정
            </span>
          )}
        </span>
        <span className="flex items-center gap-3">
          {dealer.creditLimit != null && (
            <span className="text-xs tabular-nums text-gray-500">한도 {dealer.creditLimit.toLocaleString()}P</span>
          )}
          <span className="text-gray-500">{dealer.phone}</span>
          <button
            type="button"
            data-testid={`dealer-edit-button-${dealer.id}`}
            onClick={() => (editing ? setEditing(false) : openEdit())}
            className="rounded-button border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {editing ? "닫기" : "수정"}
          </button>
        </span>
      </div>
      {notice && !editing && <p data-testid={`dealer-update-notice-${dealer.id}`} className="mt-2 text-xs text-primary">{notice}</p>}
      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              data-testid={`dealer-edit-username-${dealer.id}`}
              placeholder="새 아이디(비우면 유지)"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              data-testid={`dealer-edit-password-${dealer.id}`}
              type="password"
              placeholder="새 비밀번호(비우면 유지, 8자 이상)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              data-testid={`dealer-edit-name-${dealer.id}`}
              placeholder="상호/이름"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              data-testid={`dealer-edit-phone-${dealer.id}`}
              placeholder="연락처"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="rounded-button border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          {error && <p data-testid={`dealer-update-error-${dealer.id}`} className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            data-testid={`dealer-update-save-${dealer.id}`}
            disabled={busy || (form.password.length > 0 && form.password.length < 8)}
            onClick={handleSave}
            className="self-start rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-card disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      )}
    </li>
  );
}

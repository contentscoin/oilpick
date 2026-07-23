import { useState } from "react";
import { useDealers, useAssignableRiders, useDealerMutations } from "../hooks/useDealersAdmin";

/** 13 I3【admin】 좌상 관리 — 좌상 계정 생성 + 라이더 소속 배정. */
export function DealersPage() {
  const { data: dealers, isLoading } = useDealers();
  const { data: riders } = useAssignableRiders();
  const { createDealer, assignRider } = useDealerMutations();

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
              <li key={d.id} className="flex items-center justify-between rounded-card border border-gray-100 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{d.displayName}</span>
                <span className="text-gray-500">{d.phone}</span>
              </li>
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
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-card border border-gray-100 px-3 py-2 text-sm">
                <div>
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

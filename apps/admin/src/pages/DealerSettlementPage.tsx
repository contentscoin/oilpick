import { useEffect, useMemo, useState } from "react";
import { formatKrw, formatPoint, formatRelativeTime } from "@oilpick/core";
import type { DealerStatement } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import {
  useDealers,
  useDealerSettlements,
  useDealerStatements,
  useDealerSettlementMutations,
} from "../hooks/useDealersAdmin";

/** [14 J3] 청구 상세 주문을 CSV로 내려받는다(v_dealer_settlement_orders). 회계 대사용. */
async function downloadSettlementCsv(settlementId: string) {
  const { data, error } = await supabase
    .from("v_dealer_settlement_orders")
    .select("order_id, payout_method, cash_paid_amount, purchase_amount, net_amount, completed_at")
    .eq("dealer_settlement_id", settlementId)
    .order("completed_at", { ascending: true });
  if (error || !data) return;
  const header = "order_id,payout_method,waste_amount,purchase_amount,net_amount,completed_at";
  const rows = data.map(
    (r) =>
      `${r.order_id},${r.payout_method ?? ""},${r.cash_paid_amount ?? 0},${r.purchase_amount ?? 0},${r.net_amount ?? 0},${r.completed_at ?? ""}`,
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dealer-settlement-${settlementId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * [14 J3]【admin】 좌상 정산 — 좌상별 계정(보증금·한도·임계·요율) 설정 + 사용 명세 + 청구/정산/무효.
 * docs/spec/14-fresh-oil-settlement.md §4·§5. 좌상 크레딧 = 보증금 담보 B2B 외상채권(선불수단 아님).
 */
export function DealerSettlementPage() {
  const { data: dealers } = useDealers();
  const { data: statements, isPending: statementsPending } = useDealerStatements();
  const { data: settlements, isLoading } = useDealerSettlements();
  const { dealerClaim } = useDealerSettlementMutations();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const stmtByDealer = useMemo(() => {
    const m = new Map<string, DealerStatement>();
    (statements ?? []).forEach((s) => m.set(s.dealer_id, s));
    return m;
  }, [statements]);

  const dealerName = useMemo(() => {
    const m = new Map<string, string>();
    (dealers ?? []).forEach((d) => m.set(d.id, d.displayName));
    return m;
  }, [dealers]);

  async function handleClaim(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setMsg(null);
    const result = await dealerClaim(payload as never);
    setBusy(null);
    setMsg(result.ok ? "처리했어요." : result.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">좌상 정산</h1>
        <p className="text-sm text-gray-500">
          좌상 보증금 담보 사용한도와 미정산 사용액을 관리해요. 임계 도달 시 청구를 생성하세요.
        </p>
      </div>

      {msg && <p className="rounded-card bg-primary-light px-4 py-3 text-sm text-primary" data-testid="dealer-settlement-msg">{msg}</p>}

      {/* 좌상별 계정·명세 */}
      <div className="flex flex-col gap-4">
        {(dealers ?? []).map((d) => (
          <DealerAccountCard
            key={d.id}
            dealerId={d.id}
            dealerName={d.displayName}
            statement={stmtByDealer.get(d.id)}
            statementsPending={statementsPending}
            onClaim={() => handleClaim(`create-${d.id}`, { action: "create", dealerId: d.id })}
            claiming={busy === `create-${d.id}`}
          />
        ))}
        {(dealers ?? []).length === 0 && <p className="text-sm text-gray-500">등록된 좌상이 없어요.</p>}
      </div>

      {/* 청구 이력 */}
      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">청구 이력</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm" data-testid="dealer-settlement-history">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2 font-medium">좌상</th>
                  <th className="py-2 font-medium">상태</th>
                  <th className="py-2 font-medium">적립</th>
                  <th className="py-2 font-medium">차감</th>
                  <th className="py-2 font-medium">수수료</th>
                  <th className="py-2 font-medium">청구액</th>
                  <th className="py-2 font-medium">청구일</th>
                  <th className="py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {(settlements ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{dealerName.get(s.dealer_id) ?? s.dealer_id.slice(0, 8)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${
                          s.status === "SETTLED"
                            ? "bg-primary-light text-primary"
                            : s.status === "VOID"
                              ? "bg-gray-100 text-gray-400"
                              : "bg-accent-light text-accent-deep"
                        }`}
                      >
                        {s.status === "SETTLED" ? "정산완료" : s.status === "VOID" ? "무효" : "청구됨"}
                      </span>
                    </td>
                    <td className="py-2 tabular-nums text-gray-700">{formatPoint(s.point_minted)}</td>
                    <td className="py-2 tabular-nums text-gray-500">{formatPoint(s.point_spent)}</td>
                    <td className="py-2 tabular-nums text-gray-500">{formatKrw(s.fee_amount)}</td>
                    <td className="py-2 font-medium tabular-nums text-primary">{formatKrw(s.net_due)}</td>
                    <td className="py-2 text-gray-500">{formatRelativeTime(s.claimed_at)}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        {s.status === "CLAIMED" && (
                          <>
                            <button
                              type="button"
                              data-testid={`settle-${s.id}`}
                              disabled={busy === `settle-${s.id}`}
                              onClick={() => handleClaim(`settle-${s.id}`, { action: "settle", settlementId: s.id })}
                              className="rounded-button bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              정산 완료
                            </button>
                            <button
                              type="button"
                              data-testid={`void-${s.id}`}
                              disabled={busy === `void-${s.id}`}
                              onClick={() => handleClaim(`void-${s.id}`, { action: "void", settlementId: s.id })}
                              className="rounded-button border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 disabled:opacity-60"
                            >
                              무효
                            </button>
                          </>
                        )}
                        {s.status !== "VOID" && (
                          <button
                            type="button"
                            data-testid={`csv-${s.id}`}
                            onClick={() => void downloadSettlementCsv(s.id)}
                            className="rounded-button border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500"
                          >
                            CSV
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(settlements ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-sm text-gray-400">
                      청구 이력이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** 좌상 1개의 계정 설정 폼 + 사용 명세. statement가 없으면 계정 미설정(기본값 프리필). */
function DealerAccountCard({
  dealerId,
  dealerName,
  statement,
  statementsPending,
  onClaim,
  claiming,
}: {
  dealerId: string;
  dealerName: string;
  statement: DealerStatement | undefined;
  /** v_dealer_statement 조회가 아직 진행 중인지. 로드 전 저장을 막기 위한 게이트. */
  statementsPending: boolean;
  onClaim: () => void;
  claiming: boolean;
}) {
  const { setDealerAccount } = useDealerSettlementMutations();
  const [deposit, setDeposit] = useState(String(statement?.deposit_amount ?? 0));
  const [limit, setLimit] = useState(String(statement?.credit_limit ?? 0));
  const [threshold, setThreshold] = useState(String(statement?.claim_threshold ?? 5000000));
  const [feeBp, setFeeBp] = useState(String(statement?.fee_rate_bp ?? 0));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // [14 J4] statement는 dealers보다 늦게 도착할 수 있다(별도 쿼리 — /dealers를 먼저 열어 dealers 캐시가
  // 채워져 있으면 결정적으로 재현된다). useState 초기값만으로는 그때 0/0이 박히고, 저장은 부분 업데이트가
  // 아니라 4개 값 전체 upsert(fn_set_dealer_account)라 보증금·한도를 0으로 덮어쓴다.
  // credit_limit=0이 되면 해당 좌상 소속 라이더의 POINT 완료가 전부 DEALER_LIMIT_EXCEEDED로 막힌다.
  // 도착 시점에 폼을 동기화한다(사용자가 편집 중이 아닐 때만 — 편집 중 덮어쓰기 방지).
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!statement || dirty) return;
    setDeposit(String(statement.deposit_amount ?? 0));
    setLimit(String(statement.credit_limit ?? 0));
    setThreshold(String(statement.claim_threshold ?? 5000000));
    setFeeBp(String(statement.fee_rate_bp ?? 0));
  }, [statement, dirty]);

  // 로드 중에는 저장 불가. 단 로드가 끝났는데 statement가 없는 경우는 "계정 미설정"(v_dealer_statement가
  // dealer_accounts와 INNER JOIN이라 행이 없음)이므로 최초 등록을 위해 저장을 허용해야 한다.
  const formLocked = statementsPending;

  const usage = statement?.usage ?? 0;
  const headroom = statement?.headroom ?? 0;
  const overThreshold = statement?.over_threshold ?? false;
  const unsettled = statement?.unsettled_order_count ?? 0;

  async function handleSave() {
    if (formLocked) return;
    setSaving(true);
    setSaveMsg(null);
    const result = await setDealerAccount({
      dealerId,
      depositAmount: Number(deposit) || 0,
      creditLimit: Number(limit) || 0,
      claimThreshold: Number(threshold) || 1,
      feeRateBp: Number(feeBp) || 0,
    });
    setSaving(false);
    setSaveMsg(result.ok ? "저장했어요." : result.message);
    if (result.ok) setDirty(false);
  }

  return (
    <div className="rounded-card bg-white p-5 shadow-card" data-testid={`dealer-account-${dealerId}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900">{dealerName}</h3>
          {overThreshold && (
            <span className="rounded-pill bg-accent-light px-2 py-0.5 text-xs font-semibold text-accent-deep" data-testid={`over-threshold-${dealerId}`}>
              임계 초과
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            사용 <b className="tabular-nums text-gray-900">{formatPoint(usage)}</b>
          </span>
          <span className="text-gray-500">
            여유 <b className="tabular-nums text-primary">{formatPoint(headroom)}</b>
          </span>
          <button
            type="button"
            data-testid={`claim-${dealerId}`}
            disabled={claiming || unsettled === 0}
            onClick={onClaim}
            className="rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            청구 생성 ({unsettled})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label="보증금(원)" value={deposit} onChange={(v) => { setDirty(true); setDeposit(v); setLimit(String(Math.round((Number(v) || 0) * 1.4))); }} testId={`deposit-${dealerId}`} />
        <NumField label="사용한도(P)" value={limit} onChange={(v) => { setDirty(true); setLimit(v); }} testId={`limit-${dealerId}`} />
        <NumField label="청구 임계(P)" value={threshold} onChange={(v) => { setDirty(true); setThreshold(v); }} testId={`threshold-${dealerId}`} />
        <NumField label="수수료율(bp)" value={feeBp} onChange={(v) => { setDirty(true); setFeeBp(v); }} testId={`fee-${dealerId}`} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          data-testid={`save-account-${dealerId}`}
          disabled={saving || formLocked}
          onClick={handleSave}
          className="rounded-button bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "저장 중..." : "계정 저장"}
        </button>
        <span className="text-xs text-gray-400">보증금 입력 시 한도는 ×1.4로 자동 제안돼요(수정 가능).</span>
        {saveMsg && <span className="text-xs text-primary">{saveMsg}</span>}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-button border border-gray-200 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-primary"
      />
    </label>
  );
}

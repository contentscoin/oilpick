import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKrw, formatRelativeTime } from "@oilpick/core";
import { usePriceHistory } from "../hooks/usePriceAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { PriceSetOutput } from "@oilpick/core";

/**
 * 03-frontend.md apps/admin "/price": "현재값 + price-set 폼 + tick 이력 테이블 + 미니 차트".
 * price-set Edge Function만을 통해 새 tick을 등록한다(CLAUDE.md 절대 규칙 2/3과 동일한 원칙 —
 * price_ticks insert는 admin RLS로도 가능하지만 태스크 지시사항이 "price-set 폼"을 명시하므로
 * Edge Function 경유를 그대로 따른다. price-set은 T4/T5에서 이미 구현·검증됨).
 */
export function PricePage() {
  const { data: history, isLoading, refetch } = usePriceHistory(30);
  const [pricePerKg, setPricePerKg] = useState("");
  const [riderFee, setRiderFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latest = history?.[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const priceNum = Number(pricePerKg);
    const feeNum = Number(riderFee);
    if (!Number.isInteger(priceNum) || priceNum <= 0 || !Number.isInteger(feeNum) || feeNum <= 0) {
      setError("매입가와 수거비는 양의 정수로 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction<PriceSetOutput>("price-set", {
      pricePerKg: priceNum,
      riderFee: feeNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess("새 시세가 등록되었어요.");
    setPricePerKg("");
    setRiderFee("");
    refetch();
  }

  const chartData = [...(history ?? [])]
    .reverse()
    .map((tick) => ({
      time: new Date(tick.effectiveAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      pricePerKg: tick.pricePerKg,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">시세 관리</h1>
        <p className="text-sm text-zinc-500">매입가/수거비를 설정하면 즉시 새 시세로 반영돼요.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">현재 매입가</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
            {latest ? formatKrw(latest.pricePerKg) : "-"}
            <span className="text-base font-medium">/kg</span>
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            수거비 기본값 <span className="font-semibold text-zinc-800">{latest ? formatKrw(latest.riderFee) : "-"}</span>
          </p>
          {latest && (
            <p className="mt-1 text-xs text-zinc-400">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">새 시세 등록</h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">매입가(원/kg)</span>
            <input
              type="number"
              min={1}
              required
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
              data-testid="price-input"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">수거비 기본값(P)</span>
            <input
              type="number"
              min={1}
              required
              value={riderFee}
              onChange={(e) => setRiderFee(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
              data-testid="rider-fee-input"
            />
          </label>
          {error && <p className="mb-3 text-sm font-medium text-status-danger">{error}</p>}
          {success && <p className="mb-3 text-sm font-medium text-primary">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-white disabled:opacity-60"
            data-testid="price-submit"
          >
            {submitting ? "등록 중..." : "시세 등록"}
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">시세 추이</h2>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="time" fontSize={11} tick={{ fill: "#71717a" }} />
              <YAxis fontSize={11} tick={{ fill: "#71717a" }} domain={["auto", "auto"]} />
              <Tooltip />
              <Line type="monotone" dataKey="pricePerKg" stroke="#1B7A43" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">이력 (최근 {history?.length ?? 0}건)</h2>
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="price-history-table">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">매입가</th>
                  <th className="py-2 font-medium">수거비</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((tick) => (
                  <tr key={tick.id} className="border-b border-zinc-50">
                    <td className="py-2 text-zinc-600">{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2 font-medium tabular-nums">{formatKrw(tick.pricePerKg)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatKrw(tick.riderFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

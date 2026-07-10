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
import { useCouponPriceHistory, usePriceHistory } from "../hooks/usePriceAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { CouponPriceSetOutput, PriceSetOutput } from "@oilpick/core";

/**
 * 03-frontend.md apps/admin "/price" + 07 F10-① 개정:
 * - 시세(매입가) 섹션: 현재값 + price-set 폼 + tick 이력 + 미니 차트. **rider_fee 입력 필드 제거**
 *   (서버 계약은 F3b-④에서 riderFee 삭제 완료 — 여기서는 UI만 제거. 이력 테이블의 과거
 *   rider_fee 표시는 레거시 열로 유지).
 * - 쿠폰 단가 섹션 추가: 현재 단가 카드 + coupon-price-set 폼 + 최근 이력(기존 tick UI 패턴 재사용).
 * 두 tick 모두 Edge Function만 경유(절대 규칙 2/3 원칙 — 정정 불가·신규 tick만).
 * 06 E10-④: 두 섹션 공통 정정 안내 배너(TickCorrectionNotice) — 신규 tick 재등록 유도.
 */
export function PricePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">시세 관리</h1>
        <p className="text-sm text-gray-500">매입 시세와 수거쿠폰 단가를 설정하면 즉시 반영돼요.</p>
      </div>

      <OilPriceSection />
      <CouponPriceSection />
    </div>
  );
}

/**
 * 06 E10-④: tick 등록 실수 정정 안내(상시 노출). 과거 tick 수정은 스냅샷 원칙(절대 규칙 5 —
 * 주문 생성 시점 시세 고정, 이후 변동 무영향)상 금지 — 정정은 새 tick 재등록으로만 한다.
 * 시세/쿠폰 단가 두 섹션이 공유하며 testid는 섹션별 접미사로 구분한다.
 */
function TickCorrectionNotice({ testId }: { testId: string }) {
  return (
    <p
      className="rounded-card border border-accent/30 bg-accent-light px-4 py-3 text-sm text-gray-700"
      data-testid={testId}
    >
      잘못 등록했다면 새 tick을 다시 등록하세요 — 과거 tick은 수정할 수 없어요(주문 생성 시점 스냅샷 원칙).
    </p>
  );
}

function OilPriceSection() {
  const { data: history, isLoading, refetch } = usePriceHistory(30);
  const [pricePerKg, setPricePerKg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latest = history?.[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const priceNum = Number(pricePerKg);
    if (!Number.isInteger(priceNum) || priceNum <= 0) {
      setError("매입가는 양의 정수로 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction<PriceSetOutput>("price-set", {
      pricePerKg: priceNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess("새 시세가 등록되었어요.");
    setPricePerKg("");
    refetch();
  }

  const chartData = [...(history ?? [])]
    .reverse()
    .map((tick) => ({
      time: new Date(tick.effectiveAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      pricePerKg: tick.pricePerKg,
    }));

  return (
    <>
      <TickCorrectionNotice testId="tick-correction-notice-oil" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-6 shadow-card">
          <p className="text-sm text-gray-500">현재 매입가</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
            {latest ? formatKrw(latest.pricePerKg) : "-"}
            <span className="text-base font-medium">/kg</span>
          </p>
          {latest && (
            <p className="mt-1 text-xs text-gray-400">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">새 시세 등록</h2>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">매입가(원/kg)</span>
            <input
              type="number"
              min={1}
              required
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-primary"
              data-testid="price-input"
            />
          </label>
          {error && <p className="mb-3 text-sm font-medium text-status-danger">{error}</p>}
          {success && <p className="mb-3 text-sm font-medium text-primary">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-button bg-primary text-base font-semibold text-white shadow-card disabled:opacity-60"
            data-testid="price-submit"
          >
            {submitting ? "등록 중..." : "시세 등록"}
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">시세 추이</h2>
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

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">이력 (최근 {history?.length ?? 0}건)</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm" data-testid="price-history-table">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">매입가</th>
                  {/* 레거시 열: 과거 tick의 rider_fee 표시용(07 §1-3 — 신규 tick은 null="-"). */}
                  <th className="py-2 font-medium">수거비(레거시)</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((tick) => (
                  <tr key={tick.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2 font-medium tabular-nums text-primary">{formatKrw(tick.pricePerKg)}</td>
                    <td className="py-2 tabular-nums text-gray-400">
                      {tick.riderFee !== null ? formatKrw(tick.riderFee) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** 07 F10-①: 수거쿠폰 단가 섹션 — 현재 단가 카드 + coupon-price-set 폼 + 최근 이력. */
function CouponPriceSection() {
  const { data: history, isLoading, refetch } = useCouponPriceHistory(30);
  const [unitPrice, setUnitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latest = history?.[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const priceNum = Number(unitPrice);
    if (!Number.isInteger(priceNum) || priceNum <= 0) {
      setError("쿠폰 단가는 양의 정수로 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction<CouponPriceSetOutput>("coupon-price-set", {
      unitPrice: priceNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess("새 쿠폰 단가가 등록되었어요.");
    setUnitPrice("");
    refetch();
  }

  return (
    <>
      <TickCorrectionNotice testId="tick-correction-notice-coupon" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-6 shadow-card">
          <p className="text-sm text-gray-500">현재 쿠폰 단가</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-accent" data-testid="coupon-price-current">
            {latest ? formatKrw(latest.unitPrice) : "-"}
            <span className="text-base font-medium">/장</span>
          </p>
          {latest ? (
            <p className="mt-1 text-xs text-gray-400">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
          ) : (
            <p className="mt-1 text-xs text-status-danger">
              단가 미설정 — 라이더가 쿠폰을 구매할 수 없어요. 첫 단가를 등록해주세요.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">새 쿠폰 단가 등록</h2>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">쿠폰 단가(원/장)</span>
            <input
              type="number"
              min={1}
              required
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-accent"
              data-testid="coupon-price-input"
            />
          </label>
          {error && <p className="mb-3 text-sm font-medium text-status-danger">{error}</p>}
          {success && <p className="mb-3 text-sm font-medium text-primary">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-button bg-accent text-base font-semibold text-white shadow-card disabled:opacity-60"
            data-testid="coupon-price-submit"
          >
            {submitting ? "등록 중..." : "쿠폰 단가 등록"}
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">쿠폰 단가 이력 (최근 {history?.length ?? 0}건)</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm" data-testid="coupon-price-history-table">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">단가</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((tick) => (
                  <tr key={tick.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2 font-medium tabular-nums text-accent">{formatKrw(tick.unitPrice)}</td>
                  </tr>
                ))}
                {(history ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-gray-400">
                      등록된 쿠폰 단가가 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

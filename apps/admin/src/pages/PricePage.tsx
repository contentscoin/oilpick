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
import { useCouponPriceHistory, usePriceHistory, useFreshOilPriceHistory } from "../hooks/usePriceAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { QueryError } from "../components/QueryError";
import type { CouponPriceSetOutput, PriceSetOutput, FreshOilPriceSetOutput } from "@oilpick/core";

/**
 * 03-frontend.md apps/admin "/price" + 08 G7-④ + [17 Q4] 개정:
 * - 시세(매입가) 섹션: 현재값 + price-set 폼 + tick 이력 + 미니 차트(rider_fee 입력 없음 — 07 레거시).
 * - 신유 판매가 섹션(14 J2): price-set(kind='FRESH').
 * - 쿠폰 단가 섹션 복원(수거쿠폰 복권 — 08 P1 역전, 07 F10-① 원형): 현재 단가(coupon_price_ticks 최신)
 *   + coupon-price-set 폼 + 이력. 미설정이면 라이더 구매가 409(COUPON_PRICE_NOT_SET)로 막힌다 —
 *   초기 tick은 DEPLOY 필수 초기 데이터.
 * tick은 Edge Function만 경유(절대 규칙 2/3 원칙 — 정정 불가·신규 tick만).
 * 06 E10-④: 정정 안내 배너(TickCorrectionNotice) — 신규 tick 재등록 유도.
 */
export function PricePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">시세 관리</h1>
        <p className="text-sm text-gray-500">매입 시세·새 기름 판매가·수거쿠폰 단가를 설정하면 즉시 반영돼요.</p>
      </div>

      <OilPriceSection />
      <FreshOilPriceSection />
      <CouponPriceSection />
    </div>
  );
}

/**
 * [17 Q4] 수거쿠폰 단가 섹션(07 F10-① 원형 복원) — 현재 단가 카드 + coupon-price-set 폼 + 최근 이력.
 * 구매 시점 최신 tick이 coupon_purchases.unit_price로 스냅샷된다(17 C2 — 이후 변동 무영향).
 */
function CouponPriceSection() {
  const { data: history, isLoading, isError, refetch } = useCouponPriceHistory(30);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && history === undefined;
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
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">수거쿠폰 단가</h2>
        <p className="text-sm text-gray-500">
          라이더 콜 수락권(기름 1통 = 쿠폰 1장) 가격이에요. 구매 시점 단가로 스냅샷돼요.
        </p>
      </div>

      <TickCorrectionNotice testId="tick-correction-notice-coupon" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-6 shadow-card">
          <p className="text-sm text-gray-500">현재 쿠폰 단가</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-accent-deep" data-testid="coupon-price-current">
            {latest ? formatKrw(latest.unitPrice) : "-"}
            {/* [03 레이아웃 강건성] 단위는 별도 줄 — 글자 확대 시 값+단위 한 줄이 카드 폭을 밀어냈다. */}
            <span className="block text-base font-medium">/장</span>
          </p>
          {latest && (
            <p className="mt-1 text-xs text-gray-500">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
          )}
          {!latest && !isLoading && (
            <p className="mt-1 text-xs text-status-danger" data-testid="coupon-price-unset-notice">
              단가 미설정 — 라이더가 쿠폰을 구매할 수 없어요(구매 시도 409). 첫 단가를 등록해주세요
              (DEPLOY 필수 초기 데이터).
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-card">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">새 쿠폰 단가 등록</h3>
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
        <h3 className="mb-4 text-lg font-semibold text-gray-900">쿠폰 단가 이력 (최근 {history?.length ?? 0}건)</h3>
        {loadFailed ? (
          <QueryError onRetry={refetch} message="쿠폰 단가 이력을 불러오지 못했어요" />
        ) : isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm" data-testid="coupon-price-history-table">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">단가(원/장)</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((tick) => (
                  <tr key={tick.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2 font-medium tabular-nums text-accent-deep">{formatKrw(tick.unitPrice)}</td>
                  </tr>
                ))}
                {(history ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-gray-500">
                      등록된 쿠폰 단가가 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * [14 J2] 신유(새 식용유) 고시가 섹션. 18L 1종 단일 SKU — price-set(kind='FRESH')로 tick 등록.
 * 폐유 시세와 동일하게 정정 불가·신규 tick만(스냅샷 원칙). 미설정 시 user 앱 구매 UI는 숨겨진다.
 */
function FreshOilPriceSection() {
  const { data: history, isLoading, isError, refetch } = useFreshOilPriceHistory(30);
  const loadFailed = isError && history === undefined;
  const [pricePerCan, setPricePerCan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latest = history?.[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const priceNum = Number(pricePerCan);
    if (!Number.isInteger(priceNum) || priceNum <= 0) {
      setError("판매가는 양의 정수로 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction<FreshOilPriceSetOutput>("price-set", {
      kind: "FRESH",
      pricePerCan: priceNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess("새 기름 판매가가 등록되었어요.");
    setPricePerCan("");
    refetch();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">새 기름 판매가</h2>
        <p className="text-sm text-gray-500">18L 1통 기준 판매가예요. 설정하면 점주 앱에서 구매 신청이 열려요.</p>
      </div>

      <TickCorrectionNotice testId="tick-correction-notice-fresh" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-white p-6 shadow-card">
          <p className="text-sm text-gray-500">현재 판매가(18L 1통)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary" data-testid="fresh-price-current">
            {latest ? formatKrw(latest.pricePerCan) : "-"}
            {/* [03 레이아웃 강건성] 단위는 별도 줄 — 글자 확대 시 값+단위 한 줄이 카드 폭을 밀어냈다. */}
            <span className="block text-base font-medium">/통</span>
          </p>
          {latest && (
            <p className="mt-1 text-xs text-gray-500">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
          )}
          {!latest && !isLoading && (
            <p className="mt-1 text-xs text-status-danger">아직 미설정 — 점주 앱 구매 UI가 숨겨져 있어요.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-card">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">새 판매가 등록</h3>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">판매가(원/18L 1통)</span>
            <input
              type="number"
              min={1}
              required
              value={pricePerCan}
              onChange={(e) => setPricePerCan(e.target.value)}
              className="w-full rounded-button border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-primary"
              data-testid="fresh-price-input"
            />
          </label>
          {error && <p className="mb-3 text-sm font-medium text-status-danger">{error}</p>}
          {success && <p className="mb-3 text-sm font-medium text-primary">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-button bg-primary text-base font-semibold text-white shadow-card disabled:opacity-60"
            data-testid="fresh-price-submit"
          >
            {submitting ? "등록 중..." : "판매가 등록"}
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">이력 (최근 {history?.length ?? 0}건)</h3>
        {loadFailed ? (
          <QueryError onRetry={refetch} message="판매가 이력을 불러오지 못했어요" />
        ) : isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm" data-testid="fresh-price-history-table">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-2 font-medium">일시</th>
                  <th className="py-2 font-medium">판매가(18L 1통)</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((tick) => (
                  <tr key={tick.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{new Date(tick.effectiveAt).toLocaleString("ko-KR")}</td>
                    <td className="py-2 font-medium tabular-nums text-primary">{formatKrw(tick.pricePerCan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 06 E10-④: tick 등록 실수 정정 안내(상시 노출). 과거 tick 수정은 스냅샷 원칙(절대 규칙 5 —
 * 주문 생성 시점 시세 고정, 이후 변동 무영향)상 금지 — 정정은 새 tick 재등록으로만 한다.
 * 시세/신유 판매가/쿠폰 단가 세 섹션이 공유하며 testid는 섹션별 접미사로 구분한다.
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
  const { data: history, isLoading, isError, refetch } = usePriceHistory(30);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && history === undefined;
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
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
            {latest ? formatKrw(latest.pricePerKg) : "-"}
            {/* [03 레이아웃 강건성] 단위는 별도 줄 — 글자 확대 시 값+단위 한 줄이 카드 폭을 밀어냈다. */}
            <span className="block text-base font-medium">/kg</span>
          </p>
          {latest && (
            <p className="mt-1 text-xs text-gray-500">{formatRelativeTime(latest.effectiveAt)} 갱신</p>
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
              <Line type="monotone" dataKey="pricePerKg" stroke="#1C5A38" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">이력 (최근 {history?.length ?? 0}건)</h2>
        {loadFailed ? (
          <QueryError onRetry={refetch} message="시세 이력을 불러오지 못했어요" />
        ) : isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
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
                    <td className="py-2 tabular-nums text-gray-500">
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

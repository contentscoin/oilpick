// 일별 시세 리샘플 — 07-pivot-plan.md §1-5 "시세 일별 차트 규칙"의 단일 진실 구현.
// PricePage.tsx의 private resample()을 승격하되 규칙을 교정한다:
//   - 하루 대표값 = 그날 마지막 tick(종가).  (기존: 버킷의 마지막 tick — 동일 취지)
//   - tick 없는 날 = 직전값 캐리포워드(평평한 선).  (기존: 빈 날을 건너뜀 — 교정 포인트)
//   - 날짜 경계는 KST(UTC+9) 기준.  (기존 PricePage: UTC 기준 — 교정 포인트)
// DB 뷰 불필요(소비자가 전부 JS): usePriceTicksSince → resampleDaily → PriceChart.

/**
 * resampleDaily 입력 tick의 최소 형태(구조적 타입).
 * apps/user usePriceTicks의 PriceTick(id/riderFee 추가 필드 포함)이 그대로 호환된다.
 */
export interface PriceTickPoint {
  /** ISO 8601 문자열(예: "2026-07-08T09:00:00Z"). */
  effectiveAt: string;
  /** 매입가(원/kg, 정수). */
  pricePerKg: number;
}

/** 리샘플 결과 한 점: KST 날짜(YYYY-MM-DD) + 그날 종가(캐리포워드 포함). */
export interface DailyPrice {
  date: string;
  price: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 타임스탬프 → KST 달력 날짜 키(YYYY-MM-DD). */
function kstDateKey(iso: string): string {
  const t = new Date(iso).getTime();
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 하루 증가(문자열 → 문자열). KST에는 DST가 없어 UTC 자정 기준 +1일로 안전. */
function nextDateKey(dateKey: string): string {
  const t = new Date(`${dateKey}T00:00:00Z`).getTime();
  return new Date(t + DAY_MS).toISOString().slice(0, 10);
}

/** dateKey를 n일 이동(음수 가능). */
function shiftDateKey(dateKey: string, deltaDays: number): string {
  const t = new Date(`${dateKey}T00:00:00Z`).getTime();
  return new Date(t + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * price_ticks를 KST 일별 종가 시계열로 리샘플한다(최근 `days`일).
 *
 * 규칙(§1-5):
 *  - 하루 대표값 = 그날 KST 마지막 tick의 pricePerKg(종가).
 *  - tick 없는 날 = 직전 종가 캐리포워드(평평).
 *  - 반환 창은 **가장 최근 tick의 KST 날짜**를 끝점으로 하는 `days`일(전일 대비가 실제 종가끼리
 *    비교되도록 — "오늘"이 아니라 데이터 끝점 기준. 소비 훅 usePriceTicksSince가 조회 범위를,
 *    이 함수가 표시 창·캐리포워드를 담당).
 *
 * @param ticks 임의 순서의 tick 배열(범위 밖 tick이 섞여 있어도 무방 — 창 밖은 캐리포워드 시드로만 사용).
 * @param days  표시할 일수(예: 7 | 30 | 90). 0 이하면 빈 배열.
 * @returns 날짜 오름차순 DailyPrice[]. tick이 없거나 days<=0이면 [].
 */
export function resampleDaily(
  ticks: readonly PriceTickPoint[],
  days: number,
): DailyPrice[] {
  if (!ticks || ticks.length === 0 || days <= 0) return [];

  // 오름차순 정렬 → 같은 날의 마지막 tick(종가)이 자연히 map을 덮어쓴다.
  const sorted = [...ticks].sort(
    (a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime(),
  );

  const closeByDate = new Map<string, number>();
  for (const tick of sorted) {
    closeByDate.set(kstDateKey(tick.effectiveAt), tick.pricePerKg);
  }

  const firstDate = kstDateKey(sorted[0]!.effectiveAt);
  const lastDate = kstDateKey(sorted[sorted.length - 1]!.effectiveAt);

  // 창 시작 = max(첫 tick 날짜, 끝점-(days-1)). 창 이전 tick은 시드로만 흡수.
  const windowStart = shiftDateKey(lastDate, -(days - 1));
  const startDate = windowStart > firstDate ? windowStart : firstDate;

  // startDate 시점의 캐리포워드 시드(= startDate 이하 마지막 종가).
  let lastClose: number | undefined;
  for (const tick of sorted) {
    if (kstDateKey(tick.effectiveAt) <= startDate) lastClose = tick.pricePerKg;
    else break;
  }

  const out: DailyPrice[] = [];
  for (let cur = startDate; cur <= lastDate; cur = nextDateKey(cur)) {
    const close = closeByDate.get(cur);
    if (close !== undefined) lastClose = close;
    // lastClose는 startDate 정의상 항상 존재(startDate는 첫 tick 날짜 이상 + 시드 보장).
    out.push({ date: cur, price: lastClose! });
  }
  return out;
}

/**
 * 전일 종가 대비 등락(원). §1-5: "전일 대비 = 일별 종가[n-1] 기준".
 * 홈 히어로/주문 상세의 "전일 대비" pill 공용 헬퍼.
 * @returns daily[n-1].price - daily[n-2].price. 2점 미만이면 0(보합).
 */
export function dailyChange(daily: readonly DailyPrice[]): number {
  if (daily.length < 2) return 0;
  return daily[daily.length - 1]!.price - daily[daily.length - 2]!.price;
}

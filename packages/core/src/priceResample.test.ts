import { describe, expect, it } from "vitest";
import { dailyChange, resampleDaily, type PriceTickPoint } from "./priceResample";

/** 헬퍼: ISO tick 생성. */
function tick(effectiveAt: string, pricePerKg: number): PriceTickPoint {
  return { effectiveAt, pricePerKg };
}

describe("resampleDaily", () => {
  it("무tick일: 직전 종가를 캐리포워드한다(평평한 선)", () => {
    // 07-06, 07-08 tick만 존재(07-07 없음).
    const ticks = [
      tick("2026-07-06T03:00:00Z", 700), // KST 07-06 12:00
      tick("2026-07-08T03:00:00Z", 720), // KST 07-08 12:00
    ];
    expect(resampleDaily(ticks, 30)).toEqual([
      { date: "2026-07-06", price: 700 },
      { date: "2026-07-07", price: 700 }, // 캐리포워드
      { date: "2026-07-08", price: 720 },
    ]);
  });

  it("하루 다건: 그날 마지막 tick(종가)을 채택하고 입력 순서에 무관하다", () => {
    const ascending = [
      tick("2026-07-08T01:00:00Z", 700), // KST 10:00
      tick("2026-07-08T09:00:00Z", 730), // KST 18:00 (종가)
    ];
    expect(resampleDaily(ascending, 7)).toEqual([{ date: "2026-07-08", price: 730 }]);

    // 역순으로 넣어도 종가는 시각 기준으로 결정된다.
    const reversed = [...ascending].reverse();
    expect(resampleDaily(reversed, 7)).toEqual([{ date: "2026-07-08", price: 730 }]);
  });

  it("KST 날짜 경계: UTC 15시 이후 tick은 다음 KST 날짜로 버킷된다", () => {
    // UTC 기준이면 둘 다 07-08이지만 KST(+9)로는 07-08 / 07-09로 갈린다.
    const ticks = [
      tick("2026-07-08T14:00:00Z", 700), // KST 07-08 23:00
      tick("2026-07-08T15:30:00Z", 720), // KST 07-09 00:30
    ];
    expect(resampleDaily(ticks, 30)).toEqual([
      { date: "2026-07-08", price: 700 },
      { date: "2026-07-09", price: 720 },
    ]);
  });

  it("희소 데이터: 간격이 큰 두 tick 사이를 캐리포워드로 채운다", () => {
    const ticks = [
      tick("2026-07-01T03:00:00Z", 650),
      tick("2026-07-05T03:00:00Z", 680),
    ];
    expect(resampleDaily(ticks, 30)).toEqual([
      { date: "2026-07-01", price: 650 },
      { date: "2026-07-02", price: 650 },
      { date: "2026-07-03", price: 650 },
      { date: "2026-07-04", price: 650 },
      { date: "2026-07-05", price: 680 },
    ]);
  });

  it("기간 경계: 최근 days일로 잘라내고 창 이전 tick을 캐리포워드 시드로 흡수한다", () => {
    // 07-01(700), 07-10(750)만 존재. days=7 → 창은 07-04..07-10(7일).
    // 07-04~07-09는 창 밖 07-01 종가(700)를 시드로 캐리포워드.
    const ticks = [
      tick("2026-07-01T03:00:00Z", 700),
      tick("2026-07-10T03:00:00Z", 750),
    ];
    const daily = resampleDaily(ticks, 7);
    expect(daily).toHaveLength(7);
    expect(daily[0]).toEqual({ date: "2026-07-04", price: 700 });
    expect(daily[daily.length - 1]).toEqual({ date: "2026-07-10", price: 750 });
    // 중간(창 안, tick 없음)은 시드 캐리포워드.
    expect(daily[3]).toEqual({ date: "2026-07-07", price: 700 });
  });

  it("데이터 없음/비정상 days: 빈 배열", () => {
    expect(resampleDaily([], 30)).toEqual([]);
    expect(resampleDaily([tick("2026-07-08T03:00:00Z", 700)], 0)).toEqual([]);
    expect(resampleDaily([tick("2026-07-08T03:00:00Z", 700)], -5)).toEqual([]);
  });
});

describe("dailyChange", () => {
  it("마지막 두 일별 종가의 차이(전일 대비)를 반환한다", () => {
    const daily = [
      { date: "2026-07-06", price: 700 },
      { date: "2026-07-07", price: 700 },
      { date: "2026-07-08", price: 720 },
    ];
    expect(dailyChange(daily)).toBe(20);
  });

  it("하락 시 음수를 반환한다", () => {
    expect(
      dailyChange([
        { date: "2026-07-07", price: 720 },
        { date: "2026-07-08", price: 680 },
      ]),
    ).toBe(-40);
  });

  it("2점 미만이면 0(보합)", () => {
    expect(dailyChange([])).toBe(0);
    expect(dailyChange([{ date: "2026-07-08", price: 700 }])).toBe(0);
  });

  it("resampleDaily 결과와 결합해 캐리포워드 종가 기준으로 계산된다", () => {
    // 07-08 tick 없음 → 07-07 종가 캐리포워드 → 전일 대비 0.
    const daily = resampleDaily(
      [
        tick("2026-07-06T03:00:00Z", 700),
        tick("2026-07-07T03:00:00Z", 720),
      ],
      3,
    );
    // 창: 07-05..07-07? lastDate=07-07, days=3 → 07-05..07-07, 시드 없음 시작=07-06.
    // 실제 창 = 07-06(700), 07-07(720). 전일 대비 = 20.
    expect(dailyChange(daily)).toBe(20);
  });
});

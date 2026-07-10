import { describe, expect, it, vi } from "vitest";

// useOrdersAdmin 모듈이 import하는 supabase 클라이언트는 env 필요 — 순수 헬퍼 테스트라 모킹.
vi.mock("../lib/supabaseClient", () => ({ supabase: {} }));

import { dateFromBoundaryIso, dateToExclusiveBoundaryIso } from "./useOrdersAdmin";

/**
 * 06 E10-① 날짜 범위 경계 — 서버 필터(.gte/.lt)에 들어가는 ISO 경계값 검증.
 * 경계는 브라우저 로컬 자정 기준(목록 toLocaleString 표시와 동일 타임존)이라
 * 기대값도 동일한 Date 산식으로 계산해 타임존 독립적으로 단언한다.
 */
describe("useAdminOrders 날짜 경계 (06 E10-①)", () => {
  it("시작 경계 = 시작일 로컬 자정(포함)", () => {
    expect(dateFromBoundaryIso("2026-07-01")).toBe(new Date("2026-07-01T00:00:00").toISOString());
  });

  it("종료 경계 = 종료일 다음날 로컬 자정(배타) — 종료일 하루 전체가 범위에 포함된다", () => {
    const boundary = dateToExclusiveBoundaryIso("2026-07-10");
    expect(boundary).toBe(new Date("2026-07-11T00:00:00").toISOString());

    // 종료일 23:59:59.999(로컬)는 경계 미만(포함), 다음날 00:00:00은 경계 이상(제외).
    const lastMoment = new Date("2026-07-10T23:59:59.999").toISOString();
    const nextMidnight = new Date("2026-07-11T00:00:00").toISOString();
    expect(lastMoment < boundary).toBe(true);
    expect(nextMidnight < boundary).toBe(false);
  });

  it("월말 경계도 롤오버가 정확하다", () => {
    expect(dateToExclusiveBoundaryIso("2026-07-31")).toBe(new Date("2026-08-01T00:00:00").toISOString());
  });
});

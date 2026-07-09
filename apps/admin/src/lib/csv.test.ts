import { describe, expect, it } from "vitest";
import { CSV_BOM, toCsv } from "./csv";

/**
 * CSV 내보내기 유틸(07 F10-⑥, 06 E10-③ 사양) 단위 테스트:
 * - UTF-8 BOM 포함(엑셀 한글 호환)
 * - 한글 필드 무손실 직렬화
 * - RFC 4180 이스케이프(쉼표/큰따옴표/개행)
 * - null/undefined → 빈 문자열
 */
describe("toCsv", () => {
  it("BOM(U+FEFF)으로 시작한다 — 엑셀 한글 호환", () => {
    const csv = toCsv(["a"], [["b"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it("헤더 1행 + 데이터 행을 CRLF로 직렬화하고 한글을 보존한다", () => {
    const csv = toCsv(["날짜", "판매액(원)"], [["2026-07-09", 12000], ["2026-07-08", 0]]);
    expect(csv).toBe(`${CSV_BOM}날짜,판매액(원)\r\n2026-07-09,12000\r\n2026-07-08,0`);
  });

  it("쉼표/큰따옴표/개행이 포함된 필드를 RFC 4180 규칙으로 이스케이프한다", () => {
    const csv = toCsv(["메모"], [['서울, 강서구 "행복식당"'], ["줄1\n줄2"]]);
    const lines = csv.slice(CSV_BOM.length).split("\r\n");
    expect(lines[1]).toBe('"서울, 강서구 ""행복식당"""');
    // 개행 포함 필드는 큰따옴표로 감싸져 한 셀로 유지된다(행 분리 아님).
    expect(csv).toContain('"줄1\n줄2"');
  });

  it("null/undefined 셀은 빈 문자열로 직렬화한다", () => {
    const csv = toCsv(["a", "b", "c"], [[null, undefined, "x"]]);
    expect(csv.slice(CSV_BOM.length).split("\r\n")[1]).toBe(",,x");
  });
});

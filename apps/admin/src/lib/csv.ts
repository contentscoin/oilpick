// 클라이언트 CSV 생성 유틸 (06 E10-③ / 07 F10-⑥).
// 엑셀 한글 호환을 위해 UTF-8 BOM(U+FEFF)을 선두에 붙인다 — 없으면 엑셀이 한글을 깨서 연다.
// RFC 4180 이스케이프: 필드에 쉼표/큰따옴표/개행이 있으면 큰따옴표로 감싸고 내부 " 는 "" 로 이중화.
// 순수 문자열 생성(toCsv)과 브라우저 다운로드(downloadCsv)를 분리해 생성 로직을 단위 테스트한다.

export type CsvCell = string | number | null | undefined;

/** UTF-8 BOM — 엑셀 한글 인코딩 자동 인식용. */
export const CSV_BOM = "\uFEFF";

function escapeField(value: CsvCell): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 헤더 1행 + 데이터 행을 CSV 문자열로 직렬화한다(BOM 포함, CRLF 개행 — 엑셀 표준).
 * 각 셀은 escapeField로 이스케이프한다.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(","));
  return CSV_BOM + lines.join("\r\n");
}

/** 생성된 CSV 문자열을 파일로 다운로드한다(브라우저 전용 — DOM/Blob 사용). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

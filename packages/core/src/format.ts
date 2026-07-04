// 표시용 포맷터. 03-frontend.md "packages/core" 절: formatPoint, formatKrw, formatKg, 상대시간.

/** 포인트 표시. 1P = 1원, 정수. 예: 12345 → "12,345P". 00-domain.md "포인트 원장 규칙". */
export function formatPoint(n: number): string {
  return `${Math.trunc(n).toLocaleString("ko-KR")}P`;
}

/** 원화 표시. 예: 12345 → "12,345원". */
export function formatKrw(n: number): string {
  return `${Math.trunc(n).toLocaleString("ko-KR")}원`;
}

/**
 * kg 표시. numeric(8,1) 소수 1자리 규칙(01-db-schema.sql)에 맞춰 항상 소수 1자리로 표시.
 * 예: 45.5 → "45.5kg", 45 → "45.0kg".
 */
export function formatKg(n: number): string {
  return `${n.toFixed(1)}kg`;
}

const RELATIVE_UNITS: Array<{ limitMs: number; divisor: number; unit: string }> = [
  { limitMs: 60_000, divisor: 1, unit: "초" },
  { limitMs: 3_600_000, divisor: 60_000, unit: "분" },
  { limitMs: 86_400_000, divisor: 3_600_000, unit: "시간" },
  { limitMs: 2_592_000_000, divisor: 86_400_000, unit: "일" },
  { limitMs: 31_536_000_000, divisor: 2_592_000_000, unit: "개월" },
  { limitMs: Infinity, divisor: 31_536_000_000, unit: "년" },
];

/**
 * 상대시간 포맷터. 예: "방금 전", "5분 전", "3시간 전", "2일 전".
 * date: 기준이 되는 과거(또는 미래) 시각. now: 비교 기준(기본값 현재 시각, 테스트용으로 주입 가능).
 */
export function formatRelativeTime(date: Date | string | number, now: Date | number = new Date()): string {
  const target = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  const base = typeof now === "number" ? now : now.getTime();
  const diffMs = base - target;
  const isFuture = diffMs < 0;
  const absMs = Math.abs(diffMs);

  if (absMs < 5_000) return "방금 전";

  for (const { limitMs, divisor, unit } of RELATIVE_UNITS) {
    if (absMs < limitMs) {
      const value = Math.floor(absMs / divisor);
      return isFuture ? `${value}${unit} 후` : `${value}${unit} 전`;
    }
  }
  return isFuture ? "먼 미래" : "오래 전";
}

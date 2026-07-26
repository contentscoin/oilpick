// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/format.ts.
// packages/core/src/format.ts
function formatPoint(n) {
  return `${Math.trunc(n).toLocaleString("ko-KR")}P`;
}
function formatKrw(n) {
  return `${Math.trunc(n).toLocaleString("ko-KR")}\uC6D0`;
}
function formatKg(n) {
  return `${n.toFixed(1)}kg`;
}
function formatTimeOfDay(date, now = /* @__PURE__ */ new Date()) {
  const target = typeof date === "object" ? date : new Date(date);
  const base = typeof now === "number" ? new Date(now) : now;
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const sameDay = target.getFullYear() === base.getFullYear() && target.getMonth() === base.getMonth() && target.getDate() === base.getDate();
  return sameDay ? `\uC624\uB298 ${time}` : `${target.getMonth() + 1}/${target.getDate()} ${time}`;
}
var RELATIVE_UNITS = [
  { limitMs: 6e4, divisor: 1, unit: "\uCD08" },
  { limitMs: 36e5, divisor: 6e4, unit: "\uBD84" },
  { limitMs: 864e5, divisor: 36e5, unit: "\uC2DC\uAC04" },
  { limitMs: 2592e6, divisor: 864e5, unit: "\uC77C" },
  { limitMs: 31536e6, divisor: 2592e6, unit: "\uAC1C\uC6D4" },
  { limitMs: Infinity, divisor: 31536e6, unit: "\uB144" }
];
function formatRelativeTime(date, now = /* @__PURE__ */ new Date()) {
  const target = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  const base = typeof now === "number" ? now : now.getTime();
  const diffMs = base - target;
  const isFuture = diffMs < 0;
  const absMs = Math.abs(diffMs);
  if (absMs < 5e3) return "\uBC29\uAE08 \uC804";
  for (const { limitMs, divisor, unit } of RELATIVE_UNITS) {
    if (absMs < limitMs) {
      const value = Math.floor(absMs / divisor);
      return isFuture ? `${value}${unit} \uD6C4` : `${value}${unit} \uC804`;
    }
  }
  return isFuture ? "\uBA3C \uBBF8\uB798" : "\uC624\uB798 \uC804";
}
function formatEta(durationSeconds) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const totalMin = Math.round(durationSeconds / 60);
  if (totalMin < 1) return "\uACE7 \uB3C4\uCC29";
  if (totalMin < 60) return `${totalMin}\uBD84 \uD6C4 \uB3C4\uCC29`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}\uC2DC\uAC04 \uD6C4 \uB3C4\uCC29` : `${h}\uC2DC\uAC04 ${m}\uBD84 \uD6C4 \uB3C4\uCC29`;
}
export {
  formatEta,
  formatKg,
  formatKrw,
  formatPoint,
  formatRelativeTime,
  formatTimeOfDay
};

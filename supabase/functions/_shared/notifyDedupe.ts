// [16 L2] 알림 dedupe 판정 — 순수 함수. sendPushDeduped(push.ts)가 유일한 소비자.
// EF 통합 테스트 하네스가 없으므로(16 §0-4) 판정 로직을 여기로 분리해
// `deno test supabase/functions/_shared/notifyDedupe.test.ts`로 고정한다.

/** notifications 조회 결과 중 판정에 필요한 최소 형상. */
export interface RecentNotificationRow {
  created_at: string;
}

/**
 * 같은 (user_id, kind, link) 알림을 다시 보내도 되는가.
 * recentRows는 해당 키로 조회된 최근 발송분(정렬 무관) — windowMs 안에 1건이라도 있으면 스킵.
 * created_at 파싱 불가 행은 dedupe 근거로 삼지 않는다(보수적으로 발송 허용보다 안전한 쪽이
 * 아니라, 손상 데이터가 알림을 영구히 막는 것을 피한다 — 판정 불능 행 무시).
 */
export function shouldNotify(
  recentRows: RecentNotificationRow[],
  windowMs: number,
  now: Date,
): boolean {
  if (windowMs <= 0) return true;
  const cutoff = now.getTime() - windowMs;
  return !recentRows.some((row) => {
    const t = Date.parse(row.created_at);
    return Number.isFinite(t) && t >= cutoff;
  });
}

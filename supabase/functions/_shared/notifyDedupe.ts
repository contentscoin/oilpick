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

/**
 * [16 L5] 사다리형 리마인드 판정 — 기산점(anchorMs)에서 stagesMs 경과 시점마다 정확히 1회씩.
 * 반환: 지금까지 나갔어야 할 발송 수(0..stages.length). 매분 cron이 호출해도 발송 수가
 * 계단으로만 늘어 중복 발화가 없다(order-expire broadcast_radius_km 사다리와 같은 원리를
 * notifications 발송 이력으로 추적 — 스키마 변경 0).
 */
export function ladderDueCount(anchorMs: number, stagesMs: number[], now: Date): number {
  const elapsed = now.getTime() - anchorMs;
  return stagesMs.filter((stage) => elapsed >= stage).length;
}

/**
 * [16 L5] 이번 틱에 실제로 보내야 하는가: 기산점 이후 발송분(recentRows, 같은 kind+link로 조회)
 * 개수가 due보다 적으면 true. anchorMs 이전 행(이전 제출 사이클 잔여)은 세지 않는다 —
 * 재제출(SUBMIT_MEASURE 멱등)로 기산점이 갱신되면 리마인드 사다리도 처음부터 다시 돈다.
 */
export function ladderShouldSend(
  recentRows: RecentNotificationRow[],
  anchorMs: number,
  stagesMs: number[],
  now: Date,
): boolean {
  const due = ladderDueCount(anchorMs, stagesMs, now);
  if (due === 0) return false;
  const sent = recentRows.filter((row) => {
    const t = Date.parse(row.created_at);
    return Number.isFinite(t) && t >= anchorMs;
  }).length;
  return sent < due;
}

// admin 분석 훅 공용 쿼리 헬퍼. useSettlementAdmin/useReferralAdmin 등이 공유한다
// (앱 내부 중복 제거 — 앱 경계를 넘는 공유는 @oilpick/core, 앱 내부 유틸은 이 모듈).
import { supabase } from "./supabaseClient";

/**
 * user_id 목록 → display_name 맵(임베드 미사용, .in() 단일 배치 조회). 빈 배열이면 빈 맵.
 * 정산·레퍼럴 등 집계 뷰가 id만 반환할 때 이름을 붙이는 공용 경로.
 */
export async function fetchDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

/** 최근 days일 시작 날짜(YYYY-MM-DD). 일별 추이 뷰의 `.gte("day", ...)` 하한. */
export function sinceIso(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString().slice(0, 10);
}

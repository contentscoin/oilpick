import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

/**
 * [16 L9 §6-2] 라이더 본인 정산 현황 — v_my_payout_daily(20260802000003, net 기준 미러).
 * 이번 달 일별 실적 + 포인트 지급분 합계(= 플랫폼이 나에게 오프라인 정산할 금액의 대사 근거).
 * 라이더 지갑·출금이 아니다(08 P5 불변) — 조회 전용, 지급 일정은 본사 안내.
 */
export interface MyPayoutDay {
  day: string;
  completedCount: number;
  totalKg: number;
  cashAmount: number;
  /** POINT 발행(EARN)분 — 오프라인 정산 대상 금액. */
  pointAmount: number;
  pointSpentAmount: number;
}

export interface MyPayoutSummary {
  days: MyPayoutDay[];
  /** 이번 달 포인트 지급분 합계(정산 대기 대사 금액). */
  monthPointTotal: number;
}

export function useMyPayout(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-payout", userId ?? ""],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyPayoutSummary> => {
      // [16 L10 리뷰 수정] "이번 달" 경계는 **로컬 달력** 기준으로 조립 — toISOString()은 UTC라
      // KST 1일 00~09시에 from이 전월 말일이 되어 합계에 전월 행이 섞였다(확정 결함).
      // (뷰의 day 자체는 completed_at::date=UTC 일자 — admin 뷰와 동일 규약. 라벨의 KST 편차는
      // 기존 정산 뷰들과 일관성 유지 차원에서 그대로 두고 합계 경계만 로컬로 고정한다.)
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("v_my_payout_daily")
        .select("day, completed_count, total_kg, cash_amount, point_amount, point_spent_amount")
        .gte("day", from)
        .order("day", { ascending: false });
      if (error) throw error;
      const days = (data ?? []).map((r) => ({
        day: r.day as string,
        completedCount: Number(r.completed_count ?? 0),
        totalKg: Number(r.total_kg ?? 0),
        cashAmount: Number(r.cash_amount ?? 0),
        pointAmount: Number(r.point_amount ?? 0),
        pointSpentAmount: Number(r.point_spent_amount ?? 0),
      }));
      return {
        days,
        monthPointTotal: days.reduce((s, d) => s + d.pointAmount, 0),
      };
    },
  });
}

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

/** 이번 달 1일(로컬 달력) "YYYY-MM-DD" — useMyPayout 합계 경계와 동일 규약(16 L10 리뷰 수정). */
function monthStartDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
      const from = monthStartDay();
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

/** 일별 지급 내역의 건별 행 — v_my_payout_daily 일별 행과 같은 net 규약으로 합이 맞는다. */
export interface PayoutOrderItem {
  id: string;
  /** completed_at ISO(UTC) — 일자 묶음 키의 원천. */
  completedAt: string;
  pickupAddress: string;
  finalKg: number | null;
  /** null=레거시 현금 간주(08 P3 coalesce 규약). */
  payoutMethod: "CASH" | "POINT";
  /** net 기준 지급액 = coalesce(net_amount, cash_paid_amount). 음수=상계 차액을 점주에게 지급.
      지급 자체가 없던 완료 주문(레거시)은 null 유지 — 0과 구분한다. */
  amount: number | null;
}

/**
 * 뷰의 day(= completed_at::date, **UTC**)와 동일 규약으로 건별을 일자에 묶는다 —
 * 로컬 날짜로 묶으면 KST 00~09시 완료 건이 일별 행과 다른 날짜에 붙어 합계가 어긋난다.
 * PostgREST timestamptz는 UTC 오프셋 표기로 내려오므로 ISO 앞 10자가 곧 UTC 일자다.
 */
export function groupOrdersByUtcDay(orders: PayoutOrderItem[]): Record<string, PayoutOrderItem[]> {
  const groups: Record<string, PayoutOrderItem[]> = {};
  for (const o of orders) {
    const day = o.completedAt.slice(0, 10);
    (groups[day] ??= []).push(o);
  }
  return groups;
}

/**
 * [16 L9 §6-2 확장] 이번 달 본인 완료 주문의 건별 지급 내역 — 일별 카드 확장(건별 펼침)용.
 * 스코프·경계는 useMyPayout과 동일(rider 본인 RLS + 로컬 달력 1일). 최근 200건 제한은
 * useMonthlyPickupStats와 같은 규모 근거(라이더 월 완료량) — 초과가 현실화되면 뷰로 교체.
 */
export function useMyPayoutOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-payout-orders", userId ?? ""],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<string, PayoutOrderItem[]>> => {
      if (!userId) return {};
      const from = monthStartDay();
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, completed_at, pickup_address, final_kg, payout_method, cash_paid_amount, net_amount")
        .eq("rider_id", userId)
        .eq("status", "COMPLETED")
        // 뷰의 day >= from(UTC 일자 비교)과 동치인 주문 필터.
        .gte("completed_at", `${from}T00:00:00Z`)
        .order("completed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const items = (data ?? []).map((r) => ({
        id: r.id as string,
        completedAt: r.completed_at as string,
        pickupAddress: (r.pickup_address as string) ?? "",
        finalKg: r.final_kg == null ? null : Number(r.final_kg),
        payoutMethod: (r.payout_method ?? "CASH") as "CASH" | "POINT",
        amount: r.net_amount ?? r.cash_paid_amount ?? null,
      }));
      return groupOrdersByUtcDay(items);
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import type { OrderStatus, PayoutMethod } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface OrderHistoryItem {
  id: string;
  status: OrderStatus;
  requestedKg: number;
  finalKg: number | null;
  supplierPoint: number | null;
  /** [08 P2] 현장 지급수단. null=레거시(완료 시 CASH 간주 — 08 P3). */
  payoutMethod: PayoutMethod | null;
  cashPaidAmount: number | null;
  createdAt: string;
}

export const ORDER_HISTORY_PAGE_SIZE = 10;

/**
 * U10 "/orders" 과거 판매 이력(유저 관점 표기 — 구 "수거 이력"). 03-frontend.md: "무한 스크롤 리스트" — 04-tasks.md T8 DoD는
 * "무한 스크롤 또는 페이지네이션 중 택1, 간단한 쪽으로"를 명시하므로 더 간단한 페이지네이션으로
 * 구현한다(무한 스크롤은 IntersectionObserver 등 추가 인프라가 필요해 상대적으로 복잡).
 */
export function useOrderHistory(userId: string | undefined, page: number) {
  return useQuery({
    queryKey: queryKeys.orderHistory(userId ?? "", page),
    enabled: Boolean(userId),
    queryFn: async (): Promise<{ items: OrderHistoryItem[]; hasNextPage: boolean }> => {
      if (!userId) return { items: [], hasNextPage: false };
      const from = page * ORDER_HISTORY_PAGE_SIZE;
      const to = from + ORDER_HISTORY_PAGE_SIZE; // 다음 페이지 존재 여부 확인을 위해 1건 더 조회

      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, status, requested_kg, final_kg, supplier_point, payout_method, cash_paid_amount, created_at")
        .eq("supplier_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const rows = data ?? [];
      const hasNextPage = rows.length > ORDER_HISTORY_PAGE_SIZE;
      const items = rows.slice(0, ORDER_HISTORY_PAGE_SIZE).map((row) => ({
        id: row.id,
        status: row.status,
        requestedKg: row.requested_kg,
        finalKg: row.final_kg,
        supplierPoint: row.supplier_point,
        payoutMethod: row.payout_method ?? null,
        cashPaidAmount: row.cash_paid_amount,
        createdAt: row.created_at,
      }));
      return { items, hasNextPage };
    },
  });
}

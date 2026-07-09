import { useQuery } from "@tanstack/react-query";
import type { CsCategory, CsStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

/**
 * 07 F12 ③: 라이더 고객센터 문의 내역/주문 연결 옵션. apps/user/src/hooks/useSupport.ts와 동일 패턴
 * (주문은 rider_id 기준). cs_tickets는 클라이언트가 직접 insert/select한다(원장류 아님 — RLS가 본인 것만).
 */
export interface MyTicket {
  id: string;
  category: CsCategory;
  orderId: string | null;
  title: string;
  body: string;
  status: CsStatus;
  adminReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export const csTicketsKey = (userId: string) => ["support", "tickets", userId] as const;

export function useMyTickets(userId: string | undefined) {
  return useQuery({
    queryKey: csTicketsKey(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyTicket[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("cs_tickets")
        .select("id, category, order_id, title, body, status, admin_reply, created_at, resolved_at")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        orderId: row.order_id,
        title: row.title,
        body: row.body,
        status: row.status,
        adminReply: row.admin_reply,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      }));
    },
  });
}

export interface OrderOption {
  id: string;
  label: string;
}

/** 주문 연결(선택) 드롭다운용 최근 주문 목록. 배정된 rider 본인 주문만(RLS p_order_rider). */
export function useMyOrderOptions(userId: string | undefined) {
  return useQuery({
    queryKey: ["support", "orderOptions", userId ?? ""] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<OrderOption[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, status, created_at")
        .eq("rider_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        label: `${new Date(row.created_at).toLocaleDateString("ko-KR")} · ${row.id.slice(0, 8)}`,
      }));
    },
  });
}

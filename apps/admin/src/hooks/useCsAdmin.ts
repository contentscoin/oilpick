import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CsCategory, CsStatus } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * 07 F12 ②: admin /cs 문의 큐. cs_tickets를 상태 필터로 조회한다(admin은 p_cs_read의 is_admin()
 * 게이트로 전체 read). 작성자 표시는 useOrdersAdmin과 같은 방식(profiles를 별도 조회해 Map join —
 * PostgREST 임베드가 FK 제약 이름에 의존하는 취약함을 피함). Realtime으로 신규 문의/답변 반영.
 */
export interface CsTicketRow {
  id: string;
  authorId: string;
  authorName: string;
  role: "supplier" | "rider" | "admin";
  category: CsCategory;
  orderId: string | null;
  title: string;
  body: string;
  status: CsStatus;
  adminReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

async function fetchAuthorNames(): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, display_name");
  return new Map<string, string>((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

export function useCsTickets(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.csTickets(statusFilter),
    queryFn: async (): Promise<CsTicketRow[]> => {
      let q = supabase
        .from("cs_tickets")
        .select("id, author_id, role, category, order_id, title, body, status, admin_reply, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "ALL") {
        q = q.eq("status", statusFilter);
      }
      const [{ data, error }, authorNames] = await Promise.all([q, fetchAuthorNames()]);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        authorId: row.author_id,
        authorName: authorNames.get(row.author_id) ?? row.author_id.slice(0, 8),
        role: row.role,
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

  useEffect(() => {
    const channel = supabase
      .channel("admin_cs_tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "cs_tickets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "cs"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

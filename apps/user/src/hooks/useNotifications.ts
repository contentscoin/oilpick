import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * "/notifications" 알림함. notifications 테이블(01-db-schema.sql) 조회 + Realtime 구독(INSERT).
 * 03-frontend.md 공통 규칙: "Realtime 이벤트 수신 시 해당 queryKey invalidate".
 */
export function useNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.notifications(userId ?? "");

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications_self_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

/**
 * 알림 읽음 처리. notifications.read_at은 본인 행에 한해 RLS(p_noti_update)로 update가
 * 허용된다(01-db-schema.sql) — 상태머신/포인트 테이블이 아니라 CLAUDE.md 절대 규칙 2와
 * 무관하다.
 */
export function useMarkNotificationRead(userId: string | undefined) {
  const queryClient = useQueryClient();
  return async (notificationId: number) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .is("read_at", null);
    if (error) throw error;
    if (userId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
    }
  };
}

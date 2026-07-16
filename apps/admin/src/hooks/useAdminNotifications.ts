import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

/**
 * admin 알림 벨 데이터 훅 — 이의신청(DISPUTE)·무수락 자동 취소 등 서버가 admin에게 insert하는
 * notifications 행의 소비 지면(00-domain.md 알림 매트릭스 "admin 웹 알림" — 기존엔 소비처가 없어
 * 데드레터였다, 교차 이음새 감사 확정 결함). RLS p_noti_read(본인 행)·p_noti_update(read_at 갱신)
 * 범위 안에서만 동작하고 쓰기는 read_at 갱신뿐이다.
 */

export interface AdminNotificationRow {
  id: number;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const LIST_LIMIT = 20;

/** 최근 알림 목록 + Realtime(INSERT 시 invalidate — user/rider 앱 NotificationsPage 선례). */
export function useAdminNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.adminNotifications(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<AdminNotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as number,
        title: row.title as string,
        body: row.body as string,
        link: (row.link as string | null) ?? null,
        readAt: (row.read_at as string | null) ?? null,
        createdAt: row.created_at as string,
      }));
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`admin_notifications_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

/** read_at 갱신(본인 행 — RLS p_noti_update). 성공 시 목록 invalidate. */
export function useMarkAdminNotificationRead(userId: string | undefined) {
  const queryClient = useQueryClient();
  return async (notificationId: number): Promise<void> => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);
    if (error) {
      console.error("알림 읽음 처리 실패", error);
      return;
    }
    if (userId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications(userId) });
    }
  };
}

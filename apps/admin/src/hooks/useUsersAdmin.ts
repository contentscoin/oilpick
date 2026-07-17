import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface AdminSupplierRow {
  id: string;
  displayName: string;
  storeName: string;
  bizNumber: string;
  address: string;
  phone: string;
  createdAt: string;
}

/**
 * 03-frontend.md apps/admin "/users": "supplier/rider 탭".
 * profiles(display_name/phone)와 supplier_profiles는 별도 조회 후 Map으로 join한다
 * (useOrdersAdmin.ts fetchNameMaps와 동일 이유 — PostgREST 임베드가 요구하는 FK 제약 이름을
 * 가정하지 않기 위함).
 */
export function useAdminSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers(),
    queryFn: async (): Promise<AdminSupplierRow[]> => {
      const [{ data, error }, { data: profileRows, error: profileErr }] = await Promise.all([
        supabase
          .from("supplier_profiles")
          .select("id, store_name, biz_number, address, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, display_name, phone").eq("role", "supplier"),
      ]);
      if (error) throw error;
      if (profileErr) throw profileErr;
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
      return (data ?? []).map((row) => {
        const profile = profileMap.get(row.id) as { display_name: string; phone: string } | undefined;
        return {
          id: row.id,
          displayName: profile?.display_name ?? "-",
          storeName: row.store_name,
          bizNumber: row.biz_number,
          address: row.address,
          phone: profile?.phone ?? "-",
          createdAt: row.created_at,
        };
      });
    },
  });
}

export interface AdminRiderRow {
  id: string;
  displayName: string;
  phone: string;
  bizNumber: string;
  vehicleNumber: string;
  verifyStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectReason: string | null;
  docBizUrl: string | null;
  docVehicleUrl: string | null;
  docPermitUrl: string | null;
  recyclerName: string | null;
  recyclerContact: string | null;
  isOnline: boolean;
  createdAt: string;
}

/** rider PENDING 큐 포함 전체 라이더 목록. statusFilter: 'ALL' | verify_status. */
export function useAdminRiders(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.riders(statusFilter),
    queryFn: async (): Promise<AdminRiderRow[]> => {
      let q = supabase
        .from("rider_profiles")
        .select(
          "id, biz_number, vehicle_number, verify_status, reject_reason, doc_biz_url, doc_vehicle_url, doc_permit_url, recycler_name, recycler_contact, is_online, created_at",
        )
        .order("created_at", { ascending: false });
      if (statusFilter !== "ALL") {
        q = q.eq("verify_status", statusFilter);
      }
      const [{ data, error }, { data: profileRows, error: profileErr }] = await Promise.all([
        q,
        supabase.from("profiles").select("id, display_name, phone").eq("role", "rider"),
      ]);
      if (error) throw error;
      if (profileErr) throw profileErr;
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
      return (data ?? []).map((row) => {
        const profile = profileMap.get(row.id) as { display_name: string; phone: string } | undefined;
        return {
          id: row.id,
          displayName: profile?.display_name ?? row.id.slice(0, 8),
          phone: profile?.phone ?? "-",
          bizNumber: row.biz_number,
          vehicleNumber: row.vehicle_number,
          verifyStatus: row.verify_status,
          rejectReason: row.reject_reason,
          docBizUrl: row.doc_biz_url,
          docVehicleUrl: row.doc_vehicle_url,
          docPermitUrl: row.doc_permit_url,
          recyclerName: row.recycler_name,
          recyclerContact: row.recycler_contact,
          isOnline: row.is_online,
          createdAt: row.created_at,
        };
      });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_rider_profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "users", "riders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/** rider-docs 버킷은 private — 서명 URL로만 열람 가능(admin은 RLS p_rider_docs_read로 read 허용). */
export async function createRiderDocSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("rider-docs").createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

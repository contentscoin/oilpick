import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseGeographyPoint } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface AdminDepotRow {
  id: string;
  name: string;
  address: string;
  /** 좌표 파싱 실패 시 null(12 S1 — (0,0) 폴백 제거). 집하장 화면은 좌표를 표시하지 않아 무해. */
  lat: number | null;
  lng: number | null;
  qrSecret: string;
  isActive: boolean;
}

/** 03-frontend.md apps/admin "/depots": "CRUD + QR 인쇄 뷰(qr_secret을 QR 이미지로)". */
export function useAdminDepots() {
  return useQuery({
    queryKey: queryKeys.depots(),
    queryFn: async (): Promise<AdminDepotRow[]> => {
      const { data, error } = await supabase
        .from("depots")
        .select("id, name, address, location, qr_secret, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const point = parseGeographyPoint(row.location);
        return {
          id: row.id,
          name: row.name,
          address: row.address,
          lat: point?.lat ?? null,
          lng: point?.lng ?? null,
          qrSecret: row.qr_secret,
          isActive: row.is_active,
        };
      });
    },
  });
}

export interface DepotInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * 집하장 CRUD. 02-api.md에는 집하장 전용 Edge Function이 명시돼 있지 않다 — depots는
 * 01-db-schema.sql RLS(p_depot_write: "write는 admin만", is_admin() 검사)로 이미 admin 클라이언트
 * 직접 write를 허용하도록 설계돼 있으므로(price_ticks의 p_price_write와 동일 패턴), 별도
 * Edge Function 없이 anon 클라이언트(admin 세션) insert/update로 구현한다. qr_secret은
 * DB 컬럼 기본값(encode(gen_random_bytes(16),'hex'))이 자동 생성한다.
 */
export function useDepotMutations() {
  const queryClient = useQueryClient();

  async function createDepot(input: DepotInput) {
    const { error } = await supabase.from("depots").insert({
      name: input.name,
      address: input.address,
      location: `SRID=4326;POINT(${input.lng} ${input.lat})`,
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: queryKeys.depots() });
  }

  async function updateDepot(id: string, patch: Partial<DepotInput & { isActive: boolean }>) {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.address !== undefined) payload.address = patch.address;
    if (patch.isActive !== undefined) payload.is_active = patch.isActive;
    if (patch.lat !== undefined && patch.lng !== undefined) {
      payload.location = `SRID=4326;POINT(${patch.lng} ${patch.lat})`;
    }
    const { error } = await supabase.from("depots").update(payload).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: queryKeys.depots() });
  }

  return { createDepot, updateDepot };
}

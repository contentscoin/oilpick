import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";

export interface AdminDepotRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  qrSecret: string;
  isActive: boolean;
}

/**
 * useDashboard.ts parseGeographyPoint와 동일한 이유로 GeoJSON과 WKB hex 둘 다 지원한다
 * (이 환경의 PostgREST 실측 응답은 WKB hex — useDashboard.ts 주석 참고).
 */
function parsePoint(raw: unknown): { lat: number; lng: number } {
  if (raw && typeof raw === "object" && "coordinates" in raw) {
    const coords = (raw as { coordinates: [number, number] }).coordinates;
    return { lat: coords[1], lng: coords[0] };
  }
  if (typeof raw === "string" && /^[0-9a-fA-F]+$/.test(raw) && raw.length >= 50) {
    try {
      const byteLen = raw.length / 2;
      const buf = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        buf[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
      }
      const littleEndian = buf[0] === 1;
      const view = new DataView(buf.buffer);
      const lng = view.getFloat64(9, littleEndian);
      const lat = view.getFloat64(17, littleEndian);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    } catch {
      // fall through to default below
    }
  }
  return { lat: 0, lng: 0 };
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
        const point = parsePoint(row.location);
        return {
          id: row.id,
          name: row.name,
          address: row.address,
          lat: point.lat,
          lng: point.lng,
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

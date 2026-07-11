import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BigButton, colors, gray, inputClassName, inputStyle, radius, surface, useToast } from "@oilpick/ui";
import { humanizeSupabaseError, supplierProfileUpdateSchema } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import { AddressField, type AddressValue } from "../components/AddressField";

/**
 * 06-enhancement-plan.md E4 — 매장정보 수정(/my/edit). 가입 후 담당자명/상호/주소를 바꾼다.
 * 사업자등록번호는 정책상 변경 불가(읽기전용), phone/role은 대상 아님. 가입(AuthPage PROFILE
 * 단계)과 동일하게 anon 클라이언트 + 본인 행 RLS(p_profiles_update / p_sup_self)로 update한다
 * — service_role 키는 쓰지 않는다(CLAUDE.md 절대 규칙 3).
 *
 * 좌표(lat/lng): 이 환경엔 카카오 주소검색 키가 없어 저장된 location(geography)을 되읽지 않고,
 * AddressField 폴백이 기본 좌표를 유지한다(가입과 동일 동작). 실 키 주입 시 두 화면이 함께
 * 실좌표를 쓰게 된다.
 */

const DEFAULT_LAT = 37.5509;
const DEFAULT_LNG = 126.8225;

interface SupplierProfileFull {
  displayName: string;
  storeName: string;
  bizNumber: string;
  address: string;
}

function useSupplierProfileFull(userId: string | undefined) {
  return useQuery({
    queryKey: ["supplier-profile-full", userId ?? ""],
    enabled: Boolean(userId),
    queryFn: async (): Promise<SupplierProfileFull | null> => {
      if (!userId) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;

      const { data: supplier, error: supplierError } = await supabase
        .from("supplier_profiles")
        .select("store_name, biz_number, address")
        .eq("id", userId)
        .maybeSingle();
      if (supplierError) throw supplierError;

      return {
        displayName: profile?.display_name ?? "",
        storeName: supplier?.store_name ?? "",
        bizNumber: supplier?.biz_number ?? "",
        address: supplier?.address ?? "",
      };
    },
  });
}

export function ProfileEditPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: current, isLoading } = useSupplierProfileFull(userId);
  // 06 E6: 저장 성공/실패 피드백 토스트. 제출 전 검증(zod/세션)은 인라인 에러를 유지한다.
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [addressValue, setAddressValue] = useState<AddressValue>({ address: "", lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 로드된 현재 값으로 폼을 1회 프리필한다(이후 사용자 입력을 덮어쓰지 않도록 initialized 가드).
  useEffect(() => {
    if (current && !initialized) {
      setDisplayName(current.displayName);
      setStoreName(current.storeName);
      setAddressValue({ address: current.address, lat: DEFAULT_LAT, lng: DEFAULT_LNG });
      setInitialized(true);
    }
  }, [current, initialized]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = supplierProfileUpdateSchema.safeParse({
      displayName,
      storeName,
      address: addressValue.address,
      lat: addressValue.lat,
      lng: addressValue.lng,
    });
    if (!parsed.success) {
      setError("입력값을 확인해주세요.");
      return;
    }
    if (!userId) {
      setError("로그인이 만료됐어요. 다시 시도해주세요.");
      return;
    }

    setSaving(true);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.displayName })
      .eq("id", userId);
    if (profileError) {
      setSaving(false);
      showToast(humanizeSupabaseError(profileError, "저장에 실패했어요. 잠시 후 다시 시도해주세요."), { variant: "error" });
      return;
    }

    const { error: supplierError } = await supabase
      .from("supplier_profiles")
      .update({
        store_name: parsed.data.storeName,
        address: parsed.data.address,
        location: `SRID=4326;POINT(${parsed.data.lng} ${parsed.data.lat})`,
      })
      .eq("id", userId);
    setSaving(false);
    if (supplierError) {
      showToast(humanizeSupabaseError(supplierError, "저장에 실패했어요. 잠시 후 다시 시도해주세요."), { variant: "error" });
      return;
    }

    // MyPage/홈이 즉시 새 정보를 반영하도록 관련 쿼리 무효화.
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    await queryClient.invalidateQueries({ queryKey: ["supplier-profile-full", userId] });
    showToast("프로필을 저장했어요", { variant: "success" });
    navigate("/my", { replace: true });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="profile-edit-back"
          aria-label="뒤로가기"
          onClick={() => navigate("/my")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -12, background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0, color: gray[900], lineHeight: 1 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>매장정보 수정</h1>
      </div>

      {error && (
        <p role="alert" data-testid="profile-edit-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      {isLoading ? (
        <div data-testid="profile-edit-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
      ) : (
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="edit-display-name" style={{ fontSize: 14, fontWeight: 600 }}>
              담당자 이름
            </label>
            <input
              id="edit-display-name"
              data-testid="edit-display-name-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="edit-store-name" style={{ fontSize: 14, fontWeight: 600 }}>
              상호명
            </label>
            <input
              id="edit-store-name"
              data-testid="edit-store-name-input"
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 14, fontWeight: 600 }}>사업자등록번호</label>
            <div
              data-testid="edit-biz-number-readonly"
              style={{
                borderRadius: radius.button,
                border: `1px solid ${surface.border}`,
                backgroundColor: gray[100],
                padding: "12px 14px",
                fontSize: 15,
                color: colors.status.wait,
              }}
            >
              {current?.bizNumber || "-"}
              <span style={{ marginLeft: 8, fontSize: 12 }}>(변경 불가)</span>
            </div>
          </div>

          <AddressField value={addressValue} onChange={setAddressValue} />

          <BigButton type="submit" data-testid="save-profile-button" loading={saving}>
            저장
          </BigButton>
        </form>
      )}
    </main>
  );
}

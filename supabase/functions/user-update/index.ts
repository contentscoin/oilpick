// user-update (admin). docs/spec/02-api.md §22 / 19-admin-console.md §1 T4.
// 공급업체·라이더 회원 정보수정 — 이름·연락처(profiles) + 상호/사업자번호/주소(supplier_profiles)
// + 차량번호/재활용업체(rider_profiles).
//
// 왜 Edge인가: p_profiles_update가 `id = auth.uid()`뿐이라 admin이 회원 이름·연락처를 못 고친다.
// supplier/rider 프로필 테이블은 admin 직접 갱신이 되지만, 경로를 둘로 가르지 않고 감사 경로를
// 하나로 모은다(service_role 단일 진입).
//
// **금지 필드**: verify_status·dealer_id·credit_limit(각각 rider-verify·dealer-assign·
// dealer-rider-limit-set 전용 — guard_rider_verify가 DB에서도 되돌린다), role, 포인트·쿠폰 잔액.
// 좌상(dealer) 계정은 dealer-update 담당 — 여기선 404로 막는다(권한 경로 혼선 방지).

import { userUpdateInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "admin");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = userUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const {
      userId,
      displayName,
      phone,
      storeName,
      bizNumber,
      address,
      vehicleNumber,
      recyclerName,
      recyclerContact,
    } = parsed.data;

    // 대상 검증: 존재 + role ∈ {supplier, rider}만.
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile || (profile.role !== "supplier" && profile.role !== "rider")) {
      return errorResponse("NOT_FOUND", 404, "공급업체·라이더 회원을 찾을 수 없어요.");
    }
    const role = profile.role as "supplier" | "rider";
    const updated: string[] = [];

    // ── profiles(공통) ──
    const profilePatch: { display_name?: string; phone?: string } = {};
    if (displayName != null) profilePatch.display_name = displayName;
    if (phone != null) profilePatch.phone = phone;
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await admin.from("profiles").update(profilePatch).eq("id", userId);
      if (error) throw error;
      updated.push(...Object.keys(profilePatch));
    }

    // ── role별 프로필 테이블 ──
    // 대상 role에 없는 필드가 들어오면 조용히 무시하지 않고 400으로 알린다(오조작 조기 발견).
    if (role === "supplier") {
      if (vehicleNumber != null || recyclerName !== undefined || recyclerContact !== undefined) {
        return errorResponse("VALIDATION_ERROR", 400, "공급업체에는 라이더 전용 항목을 저장할 수 없어요.");
      }
      const patch: { store_name?: string; biz_number?: string; address?: string } = {};
      if (storeName != null) patch.store_name = storeName;
      if (bizNumber != null) patch.biz_number = bizNumber;
      if (address != null) patch.address = address;
      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from("supplier_profiles").update(patch).eq("id", userId);
        if (error) throw error;
        updated.push(...Object.keys(patch));
      }
    } else {
      if (storeName != null || address != null) {
        return errorResponse("VALIDATION_ERROR", 400, "라이더에는 공급업체 전용 항목을 저장할 수 없어요.");
      }
      const patch: {
        biz_number?: string;
        vehicle_number?: string;
        recycler_name?: string | null;
        recycler_contact?: string | null;
      } = {};
      if (bizNumber != null) patch.biz_number = bizNumber;
      if (vehicleNumber != null) patch.vehicle_number = vehicleNumber;
      // 재활용업체는 null(지움)이 유효한 값이라 undefined와 구분한다.
      if (recyclerName !== undefined) patch.recycler_name = recyclerName;
      if (recyclerContact !== undefined) patch.recycler_contact = recyclerContact;
      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from("rider_profiles").update(patch).eq("id", userId);
        if (error) throw error;
        updated.push(...Object.keys(patch));
      }
    }

    if (updated.length === 0) {
      return errorResponse("VALIDATION_ERROR", 400, "수정할 항목을 하나 이상 입력해주세요.");
    }

    return okResponse({ userId, role, updated });
  })
);

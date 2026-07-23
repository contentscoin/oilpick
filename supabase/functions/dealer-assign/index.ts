// dealer-assign (admin + 좌상). docs/spec/02-api.md / 13-org-dealer.md I2·D6.
// rider_profiles.dealer_id 배정/해제. dealer_id는 guard_rider_verify가 service_role만 변경을
// 허용하므로 이 Edge가 유일 경로 — 서버에서 소유권을 검증한다(RLS와 이중 방어).
//   - admin: 임의 라이더를 임의 좌상에게 배정 / 해제(dealerId=null).
//   - dealer: **미배정 라이더를 자기(dealerId=self)로만** 배정 / **자기 소속** 라이더 해제만(전담 모집, D6).

import { dealerAssignInputSchema } from "@oilpick/core/index.ts";
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
      requireRole(ctx, "admin", "dealer");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, role, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = dealerAssignInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { riderId, dealerId } = parsed.data;

    // 대상 라이더 확인.
    const { data: rider, error: riderErr } = await admin
      .from("rider_profiles")
      .select("id, dealer_id")
      .eq("id", riderId)
      .maybeSingle();
    if (riderErr) throw riderErr;
    if (!rider) return errorResponse("NOT_FOUND", 404, "라이더를 찾을 수 없어요.");

    if (role === "dealer") {
      // 좌상: 자기 소속 범위로만.
      if (dealerId === null) {
        // 해제 — 자기 소속만.
        if (rider.dealer_id !== uid) {
          return errorResponse("FORBIDDEN", 403, "내 소속 라이더만 해제할 수 있어요.");
        }
      } else {
        // 배정 — 자기 자신에게만, 그리고 미배정 라이더만.
        if (dealerId !== uid) {
          return errorResponse("FORBIDDEN", 403, "다른 좌상에게는 배정할 수 없어요.");
        }
        if (rider.dealer_id !== null) {
          return errorResponse("CONFLICT", 409, "이미 소속이 지정된 라이더예요.");
        }
      }
    } else {
      // admin: dealerId가 있으면 실제 좌상인지 검증.
      if (dealerId !== null) {
        const { data: dealer, error: dealerErr } = await admin
          .from("profiles")
          .select("role")
          .eq("id", dealerId)
          .maybeSingle();
        if (dealerErr) throw dealerErr;
        if (!dealer || dealer.role !== "dealer") {
          return errorResponse("VALIDATION_ERROR", 400, "좌상 계정이 아니에요.");
        }
      }
    }

    const { data: updated, error: updateErr } = await admin
      .from("rider_profiles")
      .update({ dealer_id: dealerId })
      .eq("id", riderId)
      .select("id, dealer_id")
      .single();
    if (updateErr) throw updateErr;

    return okResponse({ riderId: updated.id, dealerId: updated.dealer_id });
  })
);

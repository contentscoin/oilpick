// dealer-rider-limit-set (admin + 소속 좌상). docs/spec/18-dealer-credit-share.md §4 / R2·R9.
// 라이더 개인 포인트 지급 한도(rider_profiles.credit_limit) 배분. PER_RIDER 모드에서만 의미를
// 갖지만 모드와 무관하게 미리 배분해 둘 수 있다(모드 전환 시 즉시 적용).
//
// rider_profiles.credit_limit은 guard_rider_verify가 service_role 외 변경을 되돌리므로 이 Edge가
// 유일 경로다(dealer_id·verify_status와 동일 방식 — 라이더 셀프 상향 차단).
// 좌상은 **자기 소속 라이더만** 조정할 수 있다(dealer-assign의 소유권 검증 패턴 미러).

import { dealerRiderLimitSetInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = dealerRiderLimitSetInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { riderId, creditLimit } = parsed.data;

    // 대상 라이더 존재 + 소유권 검증. dealer는 자기 소속만(admin은 전체).
    const { data: rider, error: riderErr } = await admin
      .from("rider_profiles")
      .select("id, dealer_id")
      .eq("id", riderId)
      .maybeSingle();
    if (riderErr) throw riderErr;
    if (!rider) return errorResponse("NOT_FOUND", 404, "라이더를 찾을 수 없어요.");
    if (role === "dealer" && rider.dealer_id !== uid) {
      return errorResponse("FORBIDDEN", 403, "내 소속 라이더만 한도를 배분할 수 있어요.");
    }

    const { data: updated, error: rpcErr } = await admin.rpc("fn_set_rider_credit_limit", {
      p_rider_id: riderId,
      p_credit_limit: creditLimit,
      p_actor_id: uid,
    });
    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404, "라이더를 찾을 수 없어요.");
      if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
      throw rpcErr;
    }

    return okResponse({ riderId, creditLimit: updated?.credit_limit ?? null });
  })
);

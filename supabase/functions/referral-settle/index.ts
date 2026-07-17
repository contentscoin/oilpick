// referral-settle (admin). docs/spec/02-api.md "§18 referral-settle" / 09-referral.md H8:
// - 입력: { referralId, settle }. 라이더 추천 보상의 오프라인 지급 완료 마킹(또는 해제 — 오기록 정정).
// - 처리는 fn_settle_referral_reward RPC(service_role 전용)에 전량 위임 — ACTIVATED만 허용
//   (아니면 INVALID_TRANSITION), 재정산 멱등, 원장 발행 없음(라이더 지갑 없음, 08 P5).
//   referrals 쓰기는 RPC에만 존재(절대 규칙 1 확장).

import { referralSettleInputSchema } from "@oilpick/core/index.ts";
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
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = referralSettleInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { referralId, settle } = parsed.data;

    const { data: referral, error: rpcErr } = await admin.rpc("fn_settle_referral_reward", {
      p_referral_id: referralId,
      p_admin_id: uid,
      p_settle: settle,
    });

    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("NOT_FOUND")) return errorResponse("NOT_FOUND", 404);
      if (message.includes("INVALID_TRANSITION")) return errorResponse("INVALID_TRANSITION", 409);
      console.error("referral-settle: 예기치 못한 RPC 에러", rpcErr);
      throw rpcErr;
    }
    if (!referral) {
      return errorResponse("NOT_FOUND", 404);
    }

    return okResponse({
      referralId: referral.id,
      settled: referral.reward_settled_at != null,
      settledAt: referral.reward_settled_at ?? null,
    });
  })
);

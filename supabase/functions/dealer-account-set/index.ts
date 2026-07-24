// dealer-account-set (admin). docs/spec/14-fresh-oil-settlement.md §4.
// 좌상 계정(보증금·사용한도·자동청구 임계·수수료율) upsert. 쓰기는 fn_set_dealer_account
// (service_role RPC)에만 — dealer_accounts는 쓰기 RLS 부재(절대 규칙 1 미러).

import { dealerAccountSetInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = dealerAccountSetInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { dealerId, depositAmount, creditLimit, claimThreshold, feeRateBp } = parsed.data;

    const { data: account, error } = await admin.rpc("fn_set_dealer_account", {
      p_dealer_id: dealerId,
      p_deposit_amount: depositAmount,
      p_credit_limit: creditLimit,
      p_claim_threshold: claimThreshold,
      p_fee_rate_bp: feeRateBp,
      p_admin_id: uid,
    });
    if (error) {
      if ((error.message ?? "").includes("NOT_FOUND")) {
        return errorResponse("NOT_FOUND", 404, "좌상 계정을 찾을 수 없어요.");
      }
      throw error;
    }

    return okResponse({
      dealerId: account.dealer_id,
      depositAmount: account.deposit_amount,
      creditLimit: account.credit_limit,
      claimThreshold: account.claim_threshold,
      feeRateBp: account.fee_rate_bp,
    });
  })
);

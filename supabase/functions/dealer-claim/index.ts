// dealer-claim (admin). docs/spec/14-fresh-oil-settlement.md §4.
// 좌상 정산 청구 라이프사이클: create(미정산 주문 집계·스탬핑) / settle(정산 마킹) / void(스탬프 해제).
// 상태전이·집계는 fn_create_dealer_claim / fn_settle_dealer_claim / fn_void_dealer_claim(service_role RPC)에 위임.

import { dealerClaimInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = dealerClaimInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;
    if (input.action === "create") {
      rpcName = "fn_create_dealer_claim";
      rpcArgs = { p_dealer_id: input.dealerId, p_admin_id: uid };
    } else if (input.action === "settle") {
      rpcName = "fn_settle_dealer_claim";
      rpcArgs = { p_settlement_id: input.settlementId, p_admin_id: uid };
    } else {
      rpcName = "fn_void_dealer_claim";
      rpcArgs = { p_settlement_id: input.settlementId, p_admin_id: uid };
    }

    const { data: settlement, error } = await admin.rpc(rpcName, rpcArgs);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("NOT_FOUND")) {
        return errorResponse(
          "NOT_FOUND",
          404,
          input.action === "create" ? "청구할 미정산 주문이 없어요." : "정산 청구를 찾을 수 없어요.",
        );
      }
      if (msg.includes("INVALID_TRANSITION")) {
        return errorResponse("INVALID_TRANSITION", 409, "이미 처리된 청구예요.");
      }
      throw error;
    }

    return okResponse({ settlementId: settlement.id, status: settlement.status, netDue: settlement.net_due });
  })
);

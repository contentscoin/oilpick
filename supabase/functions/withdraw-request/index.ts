// withdraw-request (supplier/rider). docs/spec/02-api.md "7. withdraw-request (supplier/rider)":
// - 입력: { amount } (≥10000). 프로필에 계좌 없으면 400 NO_BANK_ACCOUNT.
// - RPC 트랜잭션: v_point_balance.available >= amount 검증(행 잠금은 원장 insert 직렬화로) →
//   WITHDRAW_REQUEST(-amount) → withdrawals insert. 잔액 부족 400 INSUFFICIENT_BALANCE.
//
// 잔액 확인+원장 기록+withdrawals insert는 단일 RPC(fn_request_withdraw,
// 20260704000007_rpc_withdraw_request.sql)로 원자적으로 처리한다 — Edge Function은 계좌 등록
// 여부만 사전 확인하고 나머지는 RPC 결과를 응답으로 변환만 한다(상태/원장 로직 재구현 금지).

import { withdrawRequestInputSchema } from "@oilpick/core/index.ts";
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
      requireRole(ctx, "supplier", "rider");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, role, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = withdrawRequestInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { amount } = parsed.data;

    // 계좌 정보는 role에 따라 supplier_profiles / rider_profiles에 각각 저장된다.
    const profileTable = role === "supplier" ? "supplier_profiles" : "rider_profiles";
    const { data: profile, error: profileErr } = await admin
      .from(profileTable)
      .select("bank_name, bank_account, bank_holder")
      .eq("id", uid)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile || !profile.bank_name || !profile.bank_account || !profile.bank_holder) {
      return errorResponse("NO_BANK_ACCOUNT", 400);
    }

    const { data: withdrawal, error: rpcErr } = await admin.rpc("fn_request_withdraw", {
      p_user_id: uid,
      p_amount: amount,
      p_bank_name: profile.bank_name,
      p_bank_account: profile.bank_account,
      p_bank_holder: profile.bank_holder,
    });

    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("INSUFFICIENT_BALANCE")) return errorResponse("INSUFFICIENT_BALANCE", 400);
      if (message.includes("VALIDATION_ERROR")) return errorResponse("VALIDATION_ERROR", 400);
      console.error("withdraw-request: 예기치 못한 RPC 에러", rpcErr);
      throw rpcErr;
    }
    if (!withdrawal) {
      return errorResponse("NOT_FOUND", 404);
    }

    return okResponse({
      withdrawalId: withdrawal.id,
      status: withdrawal.status,
      amount: withdrawal.amount,
    });
  })
);

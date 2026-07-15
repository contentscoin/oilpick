// referral-attach (supplier). docs/spec/02-api.md "referral-attach" / 09-referral.md H4:
// - 입력: { code }. 가입(supplier_profiles insert) 성공 직후 저장해둔 코드로 추천을 연결한다(best-effort).
//   실패해도 가입은 성립 — 클라이언트가 비차단으로 호출한다(09 H4).
// - referrals·point_ledger 쓰기는 service_role RPC(fn_attach_referral)에만 존재(절대 규칙 1 확장).
//   보너스 금액은 이 Edge가 core 상수(REFERRAL_SUPPLIER_BONUS/REFERRAL_RIDER_REWARD)를 스냅샷으로 넘긴다.
// - 안티어뷰즈는 RPC가 서버 강제: APPROVED 라이더 코드만 유효(INVALID_REFERRAL_CODE), 점주 1인 1회(멱등),
//   자기추천 차단. 이미 다른 코드로 연결된 점주면 ALREADY_REFERRED로 알린다(선착순 최초 확정 유지).

import {
  REFERRAL_RIDER_REWARD,
  REFERRAL_SUPPLIER_BONUS,
  referralAttachInputSchema,
} from "@oilpick/core/index.ts";
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
      requireRole(ctx, "supplier");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, admin } = ctx;

    const body = await req.json().catch(() => null);
    const parsed = referralAttachInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { code } = parsed.data; // 스키마가 trim·대문자 정규화

    const { data: referral, error: rpcErr } = await admin.rpc("fn_attach_referral", {
      p_supplier_id: uid,
      p_code: code,
      p_supplier_bonus: REFERRAL_SUPPLIER_BONUS,
      p_rider_reward: REFERRAL_RIDER_REWARD,
    });

    if (rpcErr) {
      const message = rpcErr.message ?? "";
      if (message.includes("INVALID_REFERRAL_CODE")) {
        return errorResponse("INVALID_REFERRAL_CODE", 400);
      }
      console.error("referral-attach: 예기치 못한 RPC 에러", rpcErr);
      throw rpcErr;
    }
    if (!referral) {
      return errorResponse("INVALID_REFERRAL_CODE", 400);
    }

    // 이미 다른 코드로 연결된 점주(선착순 최초 확정) — 요청 코드와 확정 코드 불일치. 멱등이지만 클라이언트에 알린다.
    if (referral.code !== code) {
      return errorResponse("ALREADY_REFERRED", 409);
    }

    return okResponse({
      status: referral.status,
      supplierBonus: referral.supplier_bonus,
    });
  })
);

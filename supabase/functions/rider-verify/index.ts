// rider-verify (admin). docs/spec/02-api.md "6. rider-verify (admin)":
// - 입력: { riderId, decision: 'APPROVED'|'REJECTED', rejectReason? }
// - 처리: verify_status 갱신 + rider 푸시.
//
// 00-domain.md "라이더 인증": "rider_profiles.verify_status: PENDING → APPROVED | REJECTED
// (admin 검수)." 클라이언트는 이 컬럼을 직접 update할 수 없다(RLS/스펙 주석 "rider verify_status는
// 클라이언트 update 금지, 컬럼 분리 함수로만") — 이 Edge Function(service_role)이 유일한 갱신 경로.

import { riderVerifyInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";

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
    const parsed = riderVerifyInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { riderId, decision, rejectReason } = parsed.data;

    if (decision === "REJECTED" && !rejectReason) {
      return errorResponse("VALIDATION_ERROR", 400, "반려 사유를 입력해주세요.");
    }

    const { data: riderProfile, error: fetchErr } = await admin
      .from("rider_profiles")
      .select("id")
      .eq("id", riderId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!riderProfile) {
      return errorResponse("NOT_FOUND", 404, "라이더를 찾을 수 없어요.");
    }

    const { data: updated, error: updateErr } = await admin
      .from("rider_profiles")
      .update({
        verify_status: decision,
        reject_reason: decision === "REJECTED" ? rejectReason : null,
      })
      .eq("id", riderId)
      .select("id, verify_status")
      .single();
    if (updateErr) throw updateErr;

    await sendPush(
      admin,
      [riderId],
      decision === "APPROVED" ? "라이더 인증 완료" : "라이더 인증 반려",
      decision === "APPROVED"
        ? "인증이 완료되어 콜을 받을 수 있어요."
        : `인증이 반려되었어요: ${rejectReason}`,
      "/verify",
    );

    return okResponse({
      riderId: updated.id,
      verifyStatus: updated.verify_status,
    });
  })
);

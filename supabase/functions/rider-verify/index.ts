// rider-verify (admin). docs/spec/02-api.md "6. rider-verify (admin)":
// - 입력: { riderId, decision: 'APPROVED'|'REJECTED'|'SUSPENDED'|'REINSTATED', rejectReason? }
// - 처리: verify_status 갱신 + rider 푸시.
//
// 00-domain.md "라이더 인증": "rider_profiles.verify_status: PENDING → APPROVED | REJECTED
// (admin 검수). SUSPENDED(정지) 추가." 클라이언트는 이 컬럼을 직접 update할 수 없다(RLS/guard_rider_verify
// 트리거) — 이 Edge Function(service_role)이 유일한 갱신 경로. service_role은 guard_rider_verify의
// 예외 경로라 verify_status/is_online을 자유롭게 갱신한다.
//
// 07 F11:
//   ① SUSPENDED(정지)/REINSTATED(해제). 정지 시 is_online 강제 false + 정지/해제 알림(§1-6).
//      open_calls RLS·order-accept 가드·fn_transition_order ACCEPT 게이트가 APPROVED를 요구하므로
//      SUSPENDED는 콜 조회/수락이 자동 차단된다(진행중 주문은 완결까지 허용 — 운행 차단 아님).
//   ② 서류 필수화: APPROVED 시 doc_permit_url(폐기물처리(수집·운반) 신고증명서) 없으면 승인 거부.
//   ③ 인계처 필수: APPROVED 시 recycler_name/recycler_contact 없으면 승인 거부(D5 전제).

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

    // 사유 필수: REJECTED(반려)·SUSPENDED(정지)는 사유를 reject_reason에 담는다.
    if ((decision === "REJECTED" || decision === "SUSPENDED") && !rejectReason) {
      return errorResponse(
        "VALIDATION_ERROR",
        400,
        decision === "REJECTED" ? "반려 사유를 입력해주세요." : "정지 사유를 입력해주세요.",
      );
    }

    const { data: riderProfile, error: fetchErr } = await admin
      .from("rider_profiles")
      .select("id, verify_status, doc_permit_url, recycler_name, recycler_contact")
      .eq("id", riderId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!riderProfile) {
      return errorResponse("NOT_FOUND", 404, "라이더를 찾을 수 없어요.");
    }

    // ② 서류 필수화 + ③ 인계처 필수: 최초 승인(APPROVED) 시 서버 검증(07 F11 규제 게이트).
    // 정지 해제(REINSTATED)는 이미 승인됐던 라이더 복귀이므로 재검증하지 않는다.
    if (decision === "APPROVED") {
      if (!riderProfile.doc_permit_url) {
        return errorResponse(
          "VALIDATION_ERROR",
          400,
          "폐기물처리(수집·운반) 신고증명서가 없어 승인할 수 없어요. 신고증명서 업로드가 필수예요.",
        );
      }
      if (!riderProfile.recycler_name?.trim() || !riderProfile.recycler_contact?.trim()) {
        return errorResponse(
          "VALIDATION_ERROR",
          400,
          "인계 재활용업체(인계처) 정보가 없어 승인할 수 없어요. 업체명과 연락처가 필수예요.",
        );
      }
    }

    // decision → verify_status 매핑 + 부수 효과.
    //   APPROVED/REINSTATED → APPROVED, reject_reason 초기화.
    //   REJECTED → REJECTED, reject_reason=사유.
    //   SUSPENDED → SUSPENDED, reject_reason=정지 사유 + is_online 강제 false.
    const nextStatus = decision === "REINSTATED" ? "APPROVED" : decision;
    const update: Record<string, unknown> = {
      verify_status: nextStatus,
      reject_reason: decision === "REJECTED" || decision === "SUSPENDED" ? rejectReason : null,
    };
    if (decision === "SUSPENDED") {
      update.is_online = false; // 정지 즉시 오프라인 강제(콜 브로드캐스트 수신 중단).
    }

    const { data: updated, error: updateErr } = await admin
      .from("rider_profiles")
      .update(update)
      .eq("id", riderId)
      .select("id, verify_status")
      .single();
    if (updateErr) throw updateErr;

    // §1-6 알림 매트릭스: 인증 승인/반려 + 정지/해제 통지.
    const push = notificationForDecision(decision, rejectReason);
    await sendPush(admin, [riderId], push.title, push.body, "/verify");

    return okResponse({
      riderId: updated.id,
      verifyStatus: updated.verify_status,
    });
  })
);

function notificationForDecision(
  decision: "APPROVED" | "REJECTED" | "SUSPENDED" | "REINSTATED",
  reason: string | undefined,
): { title: string; body: string } {
  switch (decision) {
    case "APPROVED":
      return { title: "라이더 인증 완료", body: "인증이 완료되어 콜을 받을 수 있어요." };
    case "REJECTED":
      return { title: "라이더 인증 반려", body: `인증이 반려되었어요: ${reason}` };
    case "SUSPENDED":
      return { title: "라이더 이용 정지", body: `계정이 정지되었어요: ${reason}` };
    case "REINSTATED":
      return { title: "라이더 정지 해제", body: "정지가 해제되어 다시 콜을 받을 수 있어요." };
  }
}

// dealer-update (admin). docs/spec/02-api.md §19-2 / 13-org-dealer.md I2 보강(CEO 2026-08-06).
// 좌상(dealer) 계정 정보 수정 — 아이디(GoTrue email <아이디>@oilpick.local 재매핑)·비밀번호
// (관리자 재설정)·상호·연락처. 대상이 role='dealer'가 아니면 404 — 이 Edge가 admin/일반 유저를
// 건드리는 경로가 되지 않게 한다. GoTrue 쓰기는 service_role(auth.admin)에만 존재.

import { dealerUpdateInputSchema } from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";

const LOGIN_EMAIL_DOMAIN = "@oilpick.local";

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
    const parsed = dealerUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { dealerId, username, password, displayName, phone } = parsed.data;

    // 대상 검증: 존재 + role='dealer'만 수정 대상.
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", dealerId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile || profile.role !== "dealer") {
      return errorResponse("NOT_FOUND", 404, "좌상 계정을 찾을 수 없어요.");
    }

    // GoTrue 갱신(아이디→email 재매핑, 비밀번호 재설정). 관리자 경로라 현재 비밀번호 불요.
    const authAttrs: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (username != null) {
      authAttrs.email = `${username}${LOGIN_EMAIL_DOMAIN}`;
      authAttrs.email_confirm = true; // .local 가짜 도메인 — 확인 메일 경로 없음, 즉시 확정.
    }
    if (password != null) authAttrs.password = password;
    if (Object.keys(authAttrs).length > 0) {
      const { error: authErr } = await admin.auth.admin.updateUserById(dealerId, authAttrs);
      if (authErr) {
        const msg = (authErr.message ?? "").toLowerCase();
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          return errorResponse("CONFLICT", 409, "이미 사용 중인 아이디예요.");
        }
        throw authErr;
      }
    }

    // 프로필 갱신(상호/연락처). GoTrue 갱신 후 실패하면 아이디/비번은 이미 반영된 상태 —
    // 부분 실패는 재시도로 수렴한다(둘 다 멱등 갱신).
    if (displayName != null || phone != null) {
      const patch: { display_name?: string; phone?: string } = {};
      if (displayName != null) patch.display_name = displayName;
      if (phone != null) patch.phone = phone;
      const { error: updateErr } = await admin.from("profiles").update(patch).eq("id", dealerId);
      if (updateErr) throw updateErr;
    }

    // 수정 후 로그인 아이디 반환(변경 없으면 현재 email에서 역산).
    let currentUsername = username;
    if (currentUsername == null) {
      const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(dealerId);
      if (getErr) throw getErr;
      currentUsername = (authUser?.user?.email ?? "").replace(LOGIN_EMAIL_DOMAIN, "");
    }

    return okResponse({ dealerId, username: currentUsername });
  })
);

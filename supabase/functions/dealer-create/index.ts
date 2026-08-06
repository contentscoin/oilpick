// dealer-create (admin). docs/spec/02-api.md / 13-org-dealer.md I2.
// 좌상(dealer) 계정 생성 — 아이디/비밀번호 로그인(admin과 동일한 <아이디>@oilpick.local 매핑).
// role='dealer' 부여는 권한가드(guard_profile_role)상 service_role만 가능하므로 이 Edge가 유일 경로.
// 정산 로직 없음 — 좌상은 소속 라이더 실적 통계 조회 + 모집/배정/승인만(13 D3·D5).

import { dealerCreateInputSchema } from "@oilpick/core/index.ts";
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
    const parsed = dealerCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
    }
    const { username, password, displayName, phone, creditLimit } = parsed.data;
    const email = `${username}${LOGIN_EMAIL_DOMAIN}`;

    // GoTrue 사용자 생성(service_role). 이미 있으면 409로 안내.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return errorResponse("CONFLICT", 409, "이미 사용 중인 아이디예요.");
      }
      throw createErr ?? new Error("좌상 계정 생성에 실패했어요.");
    }
    const dealerId = created.user.id;

    // profiles insert(service_role — guard_profile_role 예외 경로라 role='dealer' 부여 가능).
    const { error: profileErr } = await admin.from("profiles").insert({
      id: dealerId,
      role: "dealer",
      phone,
      display_name: displayName,
    });
    if (profileErr) {
      // 보상: 프로필 생성 실패 시 방금 만든 auth 사용자를 정리(고아 계정 방지, best-effort).
      await admin.auth.admin.deleteUser(dealerId).catch(() => {});
      throw profileErr;
    }

    // [18 R8] 초기 한도를 받았으면 계정 행까지 만든다 — 미설정 상태의 "무제한 크레딧"(18 X1)을
    // 온보딩 시점에 닫는 경로. 실패해도 좌상 생성 자체는 성공으로 두고(계정은 정산 화면에서
    // 재설정 가능) 로그만 남긴다 — 여기서 롤백하면 이미 만든 계정을 되돌려야 해 더 위험하다.
    if (creditLimit != null) {
      const { error: accountErr } = await admin.rpc("fn_set_dealer_account", {
        p_dealer_id: dealerId,
        p_deposit_amount: 0,
        p_credit_limit: creditLimit,
        p_claim_threshold: 5000000,
        p_fee_rate_bp: 0,
        p_admin_id: ctx.uid,
        p_allocation_mode: null,
      });
      if (accountErr) console.error("dealer-create: 초기 계정 생성 실패(좌상 생성은 유지)", accountErr);
    }

    return okResponse({ dealerId, username });
  })
);

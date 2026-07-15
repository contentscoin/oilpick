// referral-code (rider). docs/spec/02-api.md "referral-code" / 09-referral.md H2·H3:
// - 입력 없음(세션 라이더 본인). rider_profiles.referral_code가 있으면 그대로, 없으면 서버가
//   Crockford base32 8자를 생성해 unique 저장 후 반환. 공유 링크(shareUrl)도 함께 반환한다.
// - 코드 생성/알파벳/링크 규칙은 packages/core(generateReferralCode/buildReferralShareUrl)가 단일 진실.
//   APPROVED 검증은 attach 시점(referral-attach/fn_attach_referral)에서만 — 미승인 라이더도 코드는 볼 수 있으나
//   그 코드로는 추천이 활성화되지 않는다(09 §안티어뷰즈).

import {
  REFERRAL_LINK_BASE,
  buildReferralShareUrl,
  generateReferralCode,
} from "@oilpick/core/index.ts";
import { AuthError, requireAuth, requireRole } from "../_shared/auth.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 코드 알파벳(32=2^5)이 2^32를 균등 분할하므로 modulo 편향이 없다. crypto 기반 난수 인덱스. */
function cryptoRandomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

/**
 * 라이더 코드 확보(멱등): 있으면 반환, 없으면 생성. 동시 생성·코드 충돌을 방어한다.
 *  - update ... where id=uid AND referral_code IS NULL: 이미 채워졌으면 0행(다른 요청이 선점) → 재조회.
 *  - unique_violation(23505): 코드 충돌 → 재시도.
 * rider_profiles 행이 없으면(라이더 아님) null 반환 → 호출부가 404.
 */
async function ensureRiderReferralCode(
  admin: SupabaseClient,
  uid: string,
): Promise<string | null> {
  const { data: existing, error: selErr } = await admin
    .from("rider_profiles")
    .select("referral_code")
    .eq("id", uid)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!existing) return null; // rider_profiles 행 없음
  if (existing.referral_code) return existing.referral_code as string;

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateReferralCode(cryptoRandomInt);
    const { data, error } = await admin
      .from("rider_profiles")
      .update({ referral_code: candidate })
      .eq("id", uid)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();

    if (error) {
      // 코드 충돌(다른 라이더가 같은 코드 보유) → 재시도. 그 외 에러는 전파.
      if ((error as { code?: string }).code === "23505") continue;
      throw error;
    }
    if (data?.referral_code) return data.referral_code as string;

    // 0행 갱신 = 동시에 다른 요청이 코드를 채움. 재조회로 확정값 회수.
    const { data: again, error: againErr } = await admin
      .from("rider_profiles")
      .select("referral_code")
      .eq("id", uid)
      .maybeSingle();
    if (againErr) throw againErr;
    if (again?.referral_code) return again.referral_code as string;
  }
  throw new Error("추천코드 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
}

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    let ctx;
    try {
      ctx = await requireAuth(req);
      requireRole(ctx, "rider");
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { uid, admin } = ctx;

    const code = await ensureRiderReferralCode(admin, uid);
    if (!code) {
      return errorResponse("NOT_FOUND", 404, "라이더 프로필을 찾을 수 없어요.");
    }

    const base = Deno.env.get("REFERRAL_BASE_URL") ?? REFERRAL_LINK_BASE;
    return okResponse({ code, shareUrl: buildReferralShareUrl(code, base) });
  })
);

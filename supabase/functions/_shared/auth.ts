// 인증 헬퍼. 02-api.md 공통 규칙:
// "인증: Authorization: Bearer <supabase JWT> 필수(verify_jwt). 함수 내에서 auth.uid + profiles.role 확인."
//
// role은 클라이언트가 자칭할 수 없다 — 반드시 service_role 클라이언트로 profiles 테이블에서
// 재조회한다 (JWT의 커스텀 클레임이나 클라이언트가 보낸 값을 신뢰하지 않는다).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// 타입 전용 import이므로 packages/core/src를 직접 참조해도 Deno 런타임에 로드되지 않는다
// (esbuild가 타입 전용 export를 지워버려 vendor 산출물에는 타입이 남지 않음 — 값 import는
// 반드시 @oilpick/core/* vendor 경로를 통해야 한다. supabase/functions/_shared/vendor/build.sh 참고).
import type { UserRole } from "../../../packages/core/src/orderMachine.ts";

export interface AuthContext {
  uid: string;
  role: UserRole;
  /** service_role 권한 Supabase 클라이언트. DB 접근은 이 클라이언트로만(02-api.md 공통 규칙). */
  admin: SupabaseClient;
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "FORBIDDEN",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** service_role 클라이언트(SUPABASE_SERVICE_ROLE_KEY). */
export function getServiceRoleClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env가 필요합니다.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Authorization 헤더의 JWT를 검증해 uid를 얻고, profiles 테이블에서 role을 로드한다.
 * 실패 시 AuthError를 던진다 — 호출부에서 잡아 401/403으로 변환한다.
 */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new AuthError("UNAUTHORIZED", 401, "로그인이 필요해요.");
  }

  const admin = getServiceRoleClient();

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new AuthError("UNAUTHORIZED", 401, "로그인이 필요해요.");
  }
  const uid = userData.user.id;

  // 클라이언트가 role을 자칭하지 못하게 반드시 DB에서 재확인(CLAUDE.md 절대 규칙 지시사항).
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthError("FORBIDDEN", 403, "권한이 없어요.");
  }

  return { uid, role: profile.role as UserRole, admin };
}

/** role 가드. 허용되지 않은 role이면 AuthError(403)를 던진다. */
export function requireRole(ctx: AuthContext, ...roles: UserRole[]): void {
  if (!roles.includes(ctx.role)) {
    throw new AuthError("FORBIDDEN", 403, "권한이 없어요.");
  }
}

/**
 * [16 L10 리뷰 수정] cron(서버 간) 호출 인증 — service_role 키 직접 인정 + admin JWT 폴백.
 *
 * requireAuth는 토큰을 GoTrue getUser로 검증하는 **user JWT 전용**이라, service_role JWT
 * (sub 클레임 없음)를 넣으면 항상 401이 났다 — DEPLOY.md §1-4의 pg_net(Bearer SERVICE_ROLE_KEY)
 * 배선대로 돌리면 order-expire·settlement-watch가 매 주기 401로 조용히 죽는 확정 결함.
 * Authorization 토큰이 SUPABASE_SERVICE_ROLE_KEY와 정확히 일치하면(서버만 아는 값 — 자칭 불가)
 * cron 컨텍스트로 인정하고, 아니면 기존 admin 사용자 JWT 경로로 폴백한다(로컬 curl 검증 겸용).
 */
export async function requireCronAuth(req: Request): Promise<{ admin: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceRoleKey && token === serviceRoleKey) {
    return { admin: getServiceRoleClient() };
  }
  const ctx = await requireAuth(req);
  requireRole(ctx, "admin");
  return { admin: ctx.admin };
}

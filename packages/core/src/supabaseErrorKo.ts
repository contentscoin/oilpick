// supabase-js 직접 호출(GoTrue 인증/PostgREST/Storage)의 영어 원문 에러를 사용자용 한국어로
// 매핑한다 — 05-design-upgrade.md 2026-07-10 폴리시 패스의 후속(다음 패스 후보 → 구현).
// Edge Function 에러는 이미 ERROR_MESSAGE_KO(02-api.md 에러코드)로 매핑되므로 이 유틸의 대상이
// 아니다. 대상은 AuthPage OTP·프로필 insert/update·Storage 업로드처럼 supabase-js가 던지는
// 원문(message)이 그대로 화면에 노출되던 지점.

interface SupabaseErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

/** 한글 포함 여부 — 이미 한국어(우리가 만든 메시지)면 그대로 통과시킨다. */
function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

/**
 * 영어 원문 패턴 → 한국어 카피. 위에서부터 첫 매치 사용.
 * 패턴은 GoTrue(에러코드·문구)/PostgREST/Storage/fetch 공통 문구 기준 — 새 케이스는 여기에만 추가.
 */
const PATTERNS: Array<{ re: RegExp; ko: string }> = [
  // 인증(OTP) — GoTrue
  { re: /otp[_ ]expired|token has expired|expired or is invalid|invalid otp|invalid token/i, ko: "인증번호가 만료됐거나 올바르지 않아요. 인증번호를 다시 받아주세요." },
  { re: /rate limit|too many requests|over_sms_send_rate/i, ko: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
  { re: /sms|phone provider|unsupported phone|otp[_ ]disabled/i, ko: "지금은 인증번호 발송이 어려워요. 잠시 후 다시 시도해주세요." },
  { re: /invalid.*phone|phone.*invalid/i, ko: "휴대폰 번호 형식을 확인해주세요." },
  { re: /signups? not allowed|signup disabled/i, ko: "지금은 가입이 어려워요. 고객센터로 문의해주세요." },
  // 세션/권한 — GoTrue·PostgREST(RLS)
  { re: /jwt|session|refresh token|not authenticated|no api key/i, ko: "로그인이 만료됐어요. 다시 로그인해주세요." },
  { re: /row-level security|permission denied|not authorized|forbidden/i, ko: "권한이 없어요. 다시 로그인한 뒤 시도해주세요." },
  // 데이터 — PostgREST/Postgres
  { re: /duplicate key|already exists|already registered|unique constraint/i, ko: "이미 등록된 정보예요." },
  { re: /violates.*constraint|invalid input/i, ko: "입력값을 확인해주세요." },
  // Storage
  { re: /payload too large|entity too large|exceeded.*size/i, ko: "파일이 너무 커요. 더 작은 사진으로 다시 시도해주세요." },
  // 네트워크
  { re: /failed to fetch|network|fetch failed|load failed|timeout/i, ko: "네트워크 연결을 확인한 뒤 다시 시도해주세요." },
];

const DEFAULT_FALLBACK = "요청 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";

/**
 * supabase-js 에러를 사용자용 한국어 메시지로. 이미 한국어면 그대로 반환하고(우리 카피),
 * 영어 원문은 패턴 매핑, 매핑 실패 시 fallback(기본 공통 카피)으로 감춘다 — 원문 노출 금지.
 */
export function humanizeSupabaseError(
  error: SupabaseErrorLike | string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const raw = typeof error === "string" ? error : error?.message;
  if (!raw) return fallback;
  if (hasHangul(raw)) return raw;
  for (const { re, ko } of PATTERNS) {
    if (re.test(raw)) return ko;
  }
  return fallback;
}

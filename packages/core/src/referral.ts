// 라이더 추천(레퍼럴) 순수 헬퍼 — 09 H2/H3. Edge(referral-code)·앱(랜딩/공유)·테스트 공유.
// 코드·링크 규칙의 단일 진실. 상수는 constants.ts, zod 검증은 schemas.ts와 함께 쓴다.

/**
 * 추천코드 알파벳: Crockford base32(0-9 + A-Z에서 혼동문자 I·L·O·U 제외 = 32자).
 * schemas.referralCodeSchema 정규식과 반드시 일치(문자 집합 단일 진실).
 */
export const REFERRAL_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 추천코드 길이(자리수). */
export const REFERRAL_CODE_LENGTH = 8;

/**
 * 추천코드 생성. randomInt(max)는 [0, max) 정수를 주는 주입식 난수원 — 서버는 crypto 기반,
 * 테스트는 결정적 스텁을 넘긴다(Math.random을 코어에 하드코딩하지 않음: 결정성·번들 안전).
 */
export function generateReferralCode(randomInt: (maxExclusive: number) => number): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return out;
}

/** 코드 정규화(trim·대문자). attach RPC의 upper/trim과 동일 — 클라이언트/Edge 선처리용. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 라이더 공유 링크 생성: `${base}/ref/<CODE>`(웹 랜딩). base 후행 슬래시는 제거.
 * base 기본값은 constants.REFERRAL_LINK_BASE(호출부에서 env 우선순위 적용 후 전달).
 */
export function buildReferralShareUrl(code: string, base: string): string {
  return `${base.replace(/\/+$/, "")}/ref/${normalizeReferralCode(code)}`;
}

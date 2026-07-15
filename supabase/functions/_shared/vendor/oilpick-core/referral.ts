// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/referral.ts.
// packages/core/src/referral.ts
var REFERRAL_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var REFERRAL_CODE_LENGTH = 8;
function generateReferralCode(randomInt) {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return out;
}
function normalizeReferralCode(raw) {
  return raw.trim().toUpperCase();
}
function buildReferralShareUrl(code, base) {
  return `${base.replace(/\/+$/, "")}/ref/${normalizeReferralCode(code)}`;
}
function referralConversionRate(activated, signedUp) {
  return signedUp > 0 ? Math.round(activated / signedUp * 100) : 0;
}
export {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  buildReferralShareUrl,
  generateReferralCode,
  normalizeReferralCode,
  referralConversionRate
};

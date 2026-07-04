// 전화번호 포맷 변환. Supabase Auth(GoTrue)의 phone OTP는 E.164(국가코드, '+' 없이) 형식만
// 허용한다 — 로컬에서 직접 확인: "01000000000" 같은 국내 표기는
// "Invalid phone number format (E.164 required)" 400으로 거부되고, "821000000000"(82 =
// 대한민국, 앞자리 0 제거) 형식만 통과한다. supabase/config.toml [auth.sms.test_otp]도 이
// 형식의 키로 등록돼 있다(04-tasks.md 질문 목록 참고).
//
// U2(가입/로그인)는 사용자가 국내 표기("010-1234-5678" 등)로 입력한 값을 이 헬퍼로 변환해
// signInWithOtp/verifyOtp에 전달한다. profiles.phone 컬럼(01-db-schema.sql)에는 사용자가
// 입력한 원본 국내 표기를 그대로 저장한다 — E.164 변환은 Auth 호출 시점에만 적용.

/** 국내 표기(010-1234-5678, 01012345678 등)를 E.164(국가코드 82, '+' 없음)로 변환. */
export function toE164Kr(domesticPhone: string): string {
  const digits = domesticPhone.replace(/[^0-9]/g, "");
  if (digits.startsWith("82")) return digits;
  if (digits.startsWith("0")) return `82${digits.slice(1)}`;
  return `82${digits}`;
}

/** 한국 휴대폰 번호 형식(010/011~019로 시작, 총 10~11자리) 검증. */
export function isValidKrMobilePhone(domesticPhone: string): boolean {
  const digits = domesticPhone.replace(/[^0-9]/g, "");
  return /^01[0-9][0-9]{7,8}$/.test(digits);
}

/** "01012345678" → "010-1234-5678" 표시용 포맷. 형식이 예상과 다르면 원본을 그대로 반환. */
export function formatKrPhone(domesticPhone: string): string {
  const digits = domesticPhone.replace(/[^0-9]/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return domesticPhone;
}

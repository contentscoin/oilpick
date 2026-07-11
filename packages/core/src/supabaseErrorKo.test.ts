import { describe, expect, it } from "vitest";
import { humanizeSupabaseError } from "./supabaseErrorKo";

describe("humanizeSupabaseError", () => {
  it("maps GoTrue OTP expiry to Korean copy", () => {
    expect(humanizeSupabaseError({ message: "Token has expired or is invalid" })).toBe(
      "인증번호가 만료됐거나 올바르지 않아요. 인증번호를 다시 받아주세요.",
    );
  });

  it("maps SMS rate limit to Korean copy", () => {
    expect(humanizeSupabaseError("sms rate limit exceeded")).toBe(
      "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.",
    );
  });

  it("maps missing phone provider (프로덕션 SMS 미설정) to발송 안내", () => {
    expect(humanizeSupabaseError({ message: "unsupported phone provider" })).toBe(
      "지금은 인증번호 발송이 어려워요. 잠시 후 다시 시도해주세요.",
    );
  });

  it("maps RLS violation to permission copy", () => {
    expect(
      humanizeSupabaseError({ message: 'new row violates row-level security policy for table "profiles"' }),
    ).toBe("권한이 없어요. 다시 로그인한 뒤 시도해주세요.");
  });

  it("maps duplicate key to already-registered copy", () => {
    expect(
      humanizeSupabaseError({ message: 'duplicate key value violates unique constraint "profiles_pkey"' }),
    ).toBe("이미 등록된 정보예요.");
  });

  it("maps fetch failure to network copy", () => {
    expect(humanizeSupabaseError({ message: "Failed to fetch" })).toBe(
      "네트워크 연결을 확인한 뒤 다시 시도해주세요.",
    );
  });

  it("passes through Korean messages unchanged (우리 카피)", () => {
    expect(humanizeSupabaseError({ message: "인증에 실패했어요." })).toBe("인증에 실패했어요.");
  });

  it("hides unmapped English messages behind the fallback (원문 노출 금지)", () => {
    expect(humanizeSupabaseError({ message: "unexpected_failure: bcrypt hash mismatch" })).toBe(
      "요청 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    );
  });

  it("uses custom fallback and handles null", () => {
    expect(humanizeSupabaseError(null, "가입 처리 중 오류가 발생했어요.")).toBe(
      "가입 처리 중 오류가 발생했어요.",
    );
  });
});

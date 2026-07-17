// 09 레퍼럴 계약·헬퍼 테스트 — docs/spec/09-referral.md H2/H3/H5.
// 코드 형식(Crockford base32 8자), 정규화, 링크 생성, 코드 생성 결정성, attach/output 스키마, 상수 스냅샷.

import { describe, expect, it } from "vitest";
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_STORAGE_KEY,
  REFERRAL_LINK_BASE,
  REFERRAL_RIDER_REWARD,
  REFERRAL_STATUS_LABEL,
  REFERRAL_SUPPLIER_BONUS,
  buildReferralShareUrl,
  generateReferralCode,
  normalizeReferralCode,
  referralConversionRate,
  referralAttachInputSchema,
  referralAttachOutputSchema,
  referralCodeOutputSchema,
  referralCodeSchema,
} from "./index";

describe("referralCodeSchema (09 H2 — Crockford base32 8자)", () => {
  it("정상 8자 코드를 수용한다", () => {
    expect(referralCodeSchema.safeParse("ABCD2345").success).toBe(true);
  });

  it("소문자·공백을 정규화해 수용한다", () => {
    const parsed = referralCodeSchema.safeParse("  abcd2345  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("ABCD2345");
  });

  it("혼동문자(I·L·O·U)·길이 위반·비영숫자를 거부한다", () => {
    expect(referralCodeSchema.safeParse("ABCDILOU").success).toBe(false); // 혼동문자
    expect(referralCodeSchema.safeParse("ABC234").success).toBe(false); // 6자
    expect(referralCodeSchema.safeParse("ABCD23456").success).toBe(false); // 9자
    expect(referralCodeSchema.safeParse("ABCD-234").success).toBe(false); // 특수문자
  });

  it("알파벳 집합이 정규식과 일치한다(단일 진실)", () => {
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    for (const ch of REFERRAL_CODE_ALPHABET) {
      expect(referralCodeSchema.safeParse(ch.repeat(REFERRAL_CODE_LENGTH)).success).toBe(true);
    }
    for (const bad of "ILOU") {
      expect(REFERRAL_CODE_ALPHABET.includes(bad)).toBe(false);
    }
  });
});

describe("generateReferralCode (주입 난수원)", () => {
  it("항상 8자, 알파벳 내 문자만 생성한다", () => {
    // 0,1,2,...를 도는 결정적 스텁
    let n = 0;
    const code = generateReferralCode((max) => n++ % max);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(code).toBe("01234567");
    expect(referralCodeSchema.safeParse(code).success).toBe(true);
  });

  it("난수원이 최대 인덱스를 반환해도 알파벳 범위를 넘지 않는다", () => {
    const code = generateReferralCode((max) => max - 1);
    expect(code).toBe("Z".repeat(REFERRAL_CODE_LENGTH));
    expect(referralCodeSchema.safeParse(code).success).toBe(true);
  });
});

describe("normalizeReferralCode / buildReferralShareUrl", () => {
  it("코드를 trim·대문자화한다", () => {
    expect(normalizeReferralCode("  abcd2345 ")).toBe("ABCD2345");
  });

  it("공유 링크는 base/ref/<CODE> 형태이며 후행 슬래시를 정리한다", () => {
    expect(buildReferralShareUrl("abcd2345", "https://app.oilpick.kr")).toBe(
      "https://app.oilpick.kr/ref/ABCD2345",
    );
    expect(buildReferralShareUrl("ABCD2345", "https://app.oilpick.kr/")).toBe(
      "https://app.oilpick.kr/ref/ABCD2345",
    );
  });

  it("기본 base 상수로 유효한 URL을 만든다", () => {
    const url = buildReferralShareUrl("ABCD2345", REFERRAL_LINK_BASE);
    expect(referralCodeOutputSchema.shape.shareUrl.safeParse(url).success).toBe(true);
  });
});

describe("referral-code / referral-attach 스키마 (09 H3)", () => {
  it("referralCodeOutputSchema는 code+shareUrl을 요구한다", () => {
    expect(
      referralCodeOutputSchema.safeParse({
        code: "ABCD2345",
        shareUrl: "https://app.oilpick.kr/ref/ABCD2345",
      }).success,
    ).toBe(true);
    expect(referralCodeOutputSchema.safeParse({ code: "ABCD2345" }).success).toBe(false);
  });

  it("referralAttachInputSchema는 코드만 받고 정규화한다", () => {
    const parsed = referralAttachInputSchema.safeParse({ code: " abcd2345 " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe("ABCD2345");
  });

  it("referralAttachOutputSchema는 status+supplierBonus를 검증한다", () => {
    expect(
      referralAttachOutputSchema.safeParse({ status: "SIGNED_UP", supplierBonus: 5000 }).success,
    ).toBe(true);
    expect(
      referralAttachOutputSchema.safeParse({ status: "PENDING", supplierBonus: 5000 }).success,
    ).toBe(false);
  });
});

describe("referralConversionRate", () => {
  it("활성화/가입 백분율을 정수 반올림한다", () => {
    expect(referralConversionRate(3, 4)).toBe(75);
    expect(referralConversionRate(1, 3)).toBe(33); // round(33.33)
    expect(referralConversionRate(2, 3)).toBe(67); // round(66.67)
    expect(referralConversionRate(5, 5)).toBe(100);
  });

  it("가입 0이면 0(분모 0 방어)", () => {
    expect(referralConversionRate(0, 0)).toBe(0);
    expect(referralConversionRate(3, 0)).toBe(0);
  });
});

describe("레퍼럴 상수 (09 H5)", () => {
  it("보너스·보상·저장키가 스펙 값과 일치한다", () => {
    expect(REFERRAL_SUPPLIER_BONUS).toBe(5000);
    expect(REFERRAL_RIDER_REWARD).toBe(3000);
    expect(REFERRAL_CODE_STORAGE_KEY).toBe("oilpick_referral_code");
  });

  it("상태 라벨은 한글이다", () => {
    expect(REFERRAL_STATUS_LABEL.SIGNED_UP).toBe("가입");
    expect(REFERRAL_STATUS_LABEL.ACTIVATED).toBe("활성화");
    expect(REFERRAL_STATUS_LABEL.CANCELLED).toBe("취소");
  });
});

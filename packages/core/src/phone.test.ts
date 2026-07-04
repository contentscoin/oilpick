import { describe, expect, it } from "vitest";
import { formatKrPhone, isValidKrMobilePhone, toE164Kr } from "./phone";

describe("toE164Kr", () => {
  it("converts domestic hyphenated format to E.164 (82, no +)", () => {
    expect(toE164Kr("010-1234-5678")).toBe("821012345678");
  });

  it("converts domestic non-hyphenated format", () => {
    expect(toE164Kr("01012345678")).toBe("821012345678");
  });

  it("passes through values already in E.164", () => {
    expect(toE164Kr("821012345678")).toBe("821012345678");
  });
});

describe("isValidKrMobilePhone", () => {
  it("accepts valid 010/011 mobile numbers", () => {
    expect(isValidKrMobilePhone("010-1234-5678")).toBe(true);
    expect(isValidKrMobilePhone("01112345678")).toBe(true);
  });

  it("rejects non-mobile or malformed numbers", () => {
    expect(isValidKrMobilePhone("02-1234-5678")).toBe(false);
    expect(isValidKrMobilePhone("010-123-456")).toBe(false);
    expect(isValidKrMobilePhone("")).toBe(false);
  });
});

describe("formatKrPhone", () => {
  it("formats 11-digit numbers with hyphens", () => {
    expect(formatKrPhone("01012345678")).toBe("010-1234-5678");
  });

  it("formats 10-digit numbers with hyphens", () => {
    expect(formatKrPhone("0101234567")).toBe("010-123-4567");
  });

  it("returns original when length is unexpected", () => {
    expect(formatKrPhone("821012345678")).toBe("821012345678");
  });
});

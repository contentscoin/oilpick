import { describe, expect, it } from "vitest";
import {
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  csReplyInputSchema,
  csTicketInputSchema,
} from "./index";

// 07 F12: CS 문의 zod 스키마 + 라벨. 폼(user/rider)과 admin 답변 계약을 검증한다.

describe("csTicketInputSchema", () => {
  it("유효한 문의 입력을 통과시킨다(orderId 선택)", () => {
    const parsed = csTicketInputSchema.safeParse({ category: "ORDER", title: "제목", body: "내용" });
    expect(parsed.success).toBe(true);
  });

  it("orderId는 uuid여야 한다", () => {
    expect(csTicketInputSchema.safeParse({ category: "ETC", title: "t", body: "b", orderId: "not-uuid" }).success).toBe(
      false,
    );
    expect(
      csTicketInputSchema.safeParse({
        category: "ETC",
        title: "t",
        body: "b",
        orderId: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("빈 제목/내용, 잘못된 카테고리는 거부한다", () => {
    expect(csTicketInputSchema.safeParse({ category: "ORDER", title: "", body: "b" }).success).toBe(false);
    expect(csTicketInputSchema.safeParse({ category: "ORDER", title: "t", body: "" }).success).toBe(false);
    expect(csTicketInputSchema.safeParse({ category: "WRONG", title: "t", body: "b" }).success).toBe(false);
  });
});

describe("csReplyInputSchema", () => {
  it("IN_PROGRESS/RESOLVED만 허용한다", () => {
    expect(
      csReplyInputSchema.safeParse({ ticketId: "11111111-1111-1111-1111-111111111111", reply: "답변", status: "RESOLVED" })
        .success,
    ).toBe(true);
    expect(
      csReplyInputSchema.safeParse({ ticketId: "11111111-1111-1111-1111-111111111111", reply: "답변", status: "OPEN" })
        .success,
    ).toBe(false);
  });

  it("빈 답변은 거부한다", () => {
    expect(
      csReplyInputSchema.safeParse({ ticketId: "11111111-1111-1111-1111-111111111111", reply: "", status: "IN_PROGRESS" })
        .success,
    ).toBe(false);
  });
});

describe("CS 라벨", () => {
  it("카테고리/상태 한글 라벨을 제공한다", () => {
    expect(CS_CATEGORY_LABEL.CASH_DISPUTE).toBe("지급 분쟁");
    // [17 Q6] 쿠폰 복권으로 "(레거시)" 접미 제거 — 현역 카테고리.
    expect(CS_CATEGORY_LABEL.COUPON_PAYMENT).toBe("쿠폰 결제/환불");
    expect(CS_STATUS_LABEL.RESOLVED).toBe("완료");
  });
});

import { describe, expect, it } from "vitest";
import { toCallAlertDetail } from "./callAlertPush";

describe("toCallAlertDetail (06 E3 — 신규 콜 푸시 분류)", () => {
  it("data.type=NEW_CALL + /orders/:id 링크 → 콜 배너 대상", () => {
    expect(
      toCallAlertDetail({
        title: "신규 콜 도착",
        body: "근처에 새 수거 요청이 있어요.",
        data: { type: "NEW_CALL", link: "/orders/abc-123" },
      }),
    ).toEqual({ orderId: "abc-123", title: "신규 콜 도착", body: "근처에 새 수거 요청이 있어요." });
  });

  it("type 없는 주문 푸시(완료/취소 — link는 동일한 /orders/:id)는 무시한다", () => {
    // order-transition의 모든 라이더 푸시가 link=/orders/:id — type만이 유일한 구분자.
    expect(
      toCallAlertDetail({
        title: "수거 완료",
        body: "수거 완료 — 현금 ₩31,500 지급이 확인됐어요.",
        data: { link: "/orders/abc-123" },
      }),
    ).toBeNull();
    expect(
      toCallAlertDetail({ title: "주문 취소", data: { link: "/orders/x", type: "OTHER" } }),
    ).toBeNull();
  });

  it("type=NEW_CALL이라도 주문 링크가 없으면 무시(방어)", () => {
    expect(toCallAlertDetail({ data: { type: "NEW_CALL" } })).toBeNull();
    expect(toCallAlertDetail({ data: { type: "NEW_CALL", link: "/verify" } })).toBeNull();
  });
});

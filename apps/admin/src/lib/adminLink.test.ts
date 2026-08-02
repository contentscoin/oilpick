import { describe, expect, it } from "vitest";
import { remapToAdminRoute } from "./adminLink";

// admin 알림 link 재매핑 — 서버 공용 표기(/orders/:id)를 admin 드로어 딥링크로, 미지 경로는 no-op.

describe("remapToAdminRoute", () => {
  it("/orders/:id를 드로어 딥링크(/orders?order=<id>)로 재매핑한다", () => {
    expect(remapToAdminRoute("/orders/6f9619ff-8b86-4d01-b42d-00cf4fc964ff")).toBe(
      "/orders?order=6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    );
    expect(remapToAdminRoute("/orders/abc/")).toBe("/orders?order=abc");
  });

  it("admin에 실존하는 경로는 그대로 통과시킨다", () => {
    expect(remapToAdminRoute("/orders")).toBe("/orders");
    expect(remapToAdminRoute("/cs")).toBe("/cs");
    expect(remapToAdminRoute("/referrals")).toBe("/referrals");
  });

  it("모바일 전용/미지 경로·빈 값은 null(캐치올 이동 방지)", () => {
    expect(remapToAdminRoute("/wallet")).toBeNull();
    expect(remapToAdminRoute("/calls/123")).toBeNull();
    expect(remapToAdminRoute("")).toBeNull();
    expect(remapToAdminRoute(null)).toBeNull();
    expect(remapToAdminRoute(undefined)).toBeNull();
  });

  // [16 L10 리뷰 수정] 13/14/16이 추가한 라우트 누락 + 쿼리스트링 미지원으로
  // L8 알림(link=/statement, /dealer-settlement?dealer=<id>)이 벨에서 죽은 링크였다.
  it("dealer·정산 라우트(13/14/16)를 통과시키고, 쿼리스트링은 pathname 판정 후 보존한다", () => {
    expect(remapToAdminRoute("/statement")).toBe("/statement");
    expect(remapToAdminRoute("/dealers")).toBe("/dealers");
    expect(remapToAdminRoute("/performance")).toBe("/performance");
    expect(remapToAdminRoute("/dealer-settlement")).toBe("/dealer-settlement");
    expect(remapToAdminRoute("/dealer-settlement?dealer=d-1")).toBe("/dealer-settlement?dealer=d-1");
    // 미지 경로는 쿼리가 붙어도 여전히 null.
    expect(remapToAdminRoute("/wallet?x=1")).toBeNull();
  });
});

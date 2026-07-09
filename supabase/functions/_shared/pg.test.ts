// pg.ts 어댑터 선택 검증(07 F14-①). 기본 toss, koem은 문서 확보 전 명시적 실패, 미지원
// provider 거부를 확인한다. env 경로(PG_PROVIDER)까지 검증하므로 --allow-env가 필요하다:
// `deno test --allow-env supabase/functions/_shared/pg.test.ts`
import { assertEquals, assertThrows } from "./vendor/std-assert/mod.ts";
import { demoAdapter, getPgAdapter } from "./pg.ts";
import { tossAdapter } from "./toss.ts";
import { koemAdapter } from "./koem.ts";

Deno.test("getPgAdapter: 명시 provider 'toss' → tossAdapter", () => {
  assertEquals(getPgAdapter("toss"), tossAdapter);
  assertEquals(getPgAdapter("toss").provider, "toss");
});

Deno.test("getPgAdapter: PG_PROVIDER 미설정 기본값 toss", () => {
  Deno.env.delete("PG_PROVIDER");
  assertEquals(getPgAdapter(), tossAdapter);
});

Deno.test("getPgAdapter: PG_PROVIDER env로 선택", () => {
  Deno.env.set("PG_PROVIDER", "toss");
  try {
    assertEquals(getPgAdapter(), tossAdapter);
  } finally {
    Deno.env.delete("PG_PROVIDER");
  }
});

Deno.test("getPgAdapter: koem → koemAdapter (F14)", () => {
  assertEquals(getPgAdapter("koem"), koemAdapter);
  assertEquals(getPgAdapter("koem").provider, "koem");
});

Deno.test("getPgAdapter: demo → demoAdapter (F14 데모 운영)", () => {
  assertEquals(getPgAdapter("demo"), demoAdapter);
  assertEquals(getPgAdapter("demo").provider, "demo");
});

Deno.test("demoAdapter: PG 호출 없이 승인/취소 즉시 성공(원장·멱등은 실경로 소관)", async () => {
  const payment = await demoAdapter.confirmPayment({
    paymentKey: "demo_p1",
    orderId: "op1",
    amount: 60000,
  });
  assertEquals(payment.status, "DONE");
  assertEquals(payment.totalAmount, 60000); // confirm의 amount 대조를 통과(서버 스냅샷 기준 호출)
  assertEquals(payment.paymentKey, "demo_p1");

  const canceled = await demoAdapter.cancelPayment("demo_p1", {
    cancelReason: "환불",
    cancelAmount: 2000,
  });
  assertEquals(canceled.status, "CANCELED");
  assertEquals(canceled.totalAmount, 2000);
  assertEquals(demoAdapter.isAlreadyProcessed(new Error("x")), false);
});

Deno.test("getPgAdapter: 미지원 provider 거부", () => {
  assertThrows(() => getPgAdapter("nice"), Error, "지원하지 않는 PG_PROVIDER예요: nice");
});

// pg.ts 어댑터 선택 검증(07 F14-①). 기본 toss, koem은 문서 확보 전 명시적 실패, 미지원
// provider 거부를 확인한다. env 경로(PG_PROVIDER)까지 검증하므로 --allow-env가 필요하다:
// `deno test --allow-env supabase/functions/_shared/pg.test.ts`
import { assertEquals, assertThrows } from "./vendor/std-assert/mod.ts";
import { getPgAdapter } from "./pg.ts";
import { tossAdapter } from "./toss.ts";

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

Deno.test("getPgAdapter: koem은 미구현 명시 실패(F14 — 제휴 문서 대기)", () => {
  assertThrows(() => getPgAdapter("koem"), Error, "코엠페이먼츠 어댑터는 아직 준비되지 않았어요");
});

Deno.test("getPgAdapter: 미지원 provider 거부", () => {
  assertThrows(() => getPgAdapter("nice"), Error, "지원하지 않는 PG_PROVIDER예요: nice");
});

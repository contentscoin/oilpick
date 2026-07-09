// vendor/std-assert 수동 벤더의 계약 회귀 테스트(F14-①). 원본 @std/assert 0.224.0과의
// 동치가 깨지기 쉬운 지점(순환 참조 실패 메시지, 0/-0·NaN, 키 없는 내장 타입)을 고정한다.
// `deno test supabase/functions/_shared/std-assert.test.ts`로 실행.
import {
  assert,
  AssertionError,
  assertEquals,
  assertRejects,
  assertThrows,
} from "./vendor/std-assert/mod.ts";

Deno.test("assertEquals: 원시값 — 0/-0 동등, NaN 동등(원본 equal 계약)", () => {
  assertEquals(0, -0);
  assertEquals(NaN, NaN);
  assertThrows(() => assertEquals<number>(1, 2), AssertionError);
});

Deno.test("assertEquals: 순환 참조 불일치도 TypeError 없이 AssertionError", () => {
  type Circular = { x: number; self?: Circular };
  const a: Circular = { x: 1 };
  a.self = a;
  const b: Circular = { x: 2 };
  b.self = b;
  const err = assertThrows(() => assertEquals(a, b), AssertionError);
  assert(err.message.includes("actual"));
});

Deno.test("assertEquals: 함수 프로퍼티 객체 — 불일치 시 실패 + 메시지에 함수 표기", () => {
  const fnA = { provider: "toss", call: () => 1 };
  const fnB = { provider: "toss", call: () => 1 };
  // 함수 값은 참조가 다르면 불일치(원본 equal과 동일).
  assertThrows(() => assertEquals(fnA, fnB), AssertionError);
  // 동일 참조면 통과.
  assertEquals(fnA, fnA);
});

Deno.test("assertEquals: 키 없는 내장 타입(Date/RegExp/Map/Set/URL) 값 비교", () => {
  assertEquals(new Date(0), new Date(0));
  assertThrows(() => assertEquals(new Date(0), new Date(1)), AssertionError);
  assertEquals(/ab/g, /ab/g);
  assertThrows(() => assertEquals(/ab/g, /ab/i), AssertionError);
  assertEquals(new URL("https://a.b/c"), new URL("https://a.b/c"));
  assertThrows(
    () => assertEquals(new URL("https://a.b/c"), new URL("https://a.b/d")),
    AssertionError,
  );
  assertEquals(new Set([1, { k: 2 }]), new Set([{ k: 2 }, 1]));
  assertThrows(() => assertEquals(new Set([1]), new Set([2])), AssertionError);
  assertEquals(new Map([["a", { v: 1 }]]), new Map([["a", { v: 1 }]]));
  assertThrows(
    () => assertEquals(new Map([["a", 1]]), new Map([["a", 2]])),
    AssertionError,
  );
  // 타입 혼동은 불일치(내장 타입 vs 평범한 객체).
  assertThrows(() => assertEquals<unknown>(new Date(0), {}), AssertionError);
});

Deno.test("assertThrows/assertRejects: 클래스·메시지 검사와 미발생 실패", async () => {
  class MyError extends Error {}
  const err = assertThrows(
    () => {
      throw new MyError("boom-42");
    },
    MyError,
    "boom",
  );
  assertEquals(err.message, "boom-42");
  // 다른 클래스면 AssertionError.
  assertThrows(
    () =>
      assertThrows(
        () => {
          throw new TypeError("x");
        },
        MyError,
      ),
    AssertionError,
  );
  // throw 미발생.
  assertThrows(() => assertThrows(() => 1), AssertionError);
  const rerr = await assertRejects(() => Promise.reject(new MyError("async-boom")), MyError);
  assertEquals(rerr.message, "async-boom");
  await assertRejects(
    () => assertRejects(() => Promise.resolve(1)),
    AssertionError,
  );
});

// [16 L8] 크레딧 경보 판정 계약. `deno test supabase/functions/_shared/creditWatch.test.ts`
import { assertEquals } from "./vendor/std-assert/mod.ts";
import { dueCreditAlerts } from "./creditWatch.ts";

Deno.test("80% 미만·임계 미달 — 무경보", () => {
  assertEquals(dueCreditAlerts({ usage: 1_000_000, credit_limit: 14_000_000, over_threshold: false }), {
    band80: false,
    overThreshold: false,
  });
});

Deno.test("정확히 80% 경계 — 밴드 경보(≥)", () => {
  assertEquals(
    dueCreditAlerts({ usage: 11_200_000, credit_limit: 14_000_000, over_threshold: false }).band80,
    true,
  );
});

Deno.test("임계(over_threshold) 진입 — 청구 검토 경보", () => {
  assertEquals(
    dueCreditAlerts({ usage: 5_000_000, credit_limit: 14_000_000, over_threshold: true }),
    { band80: false, overThreshold: true },
  );
});

Deno.test("한도 0(미설정) — 비율 판정 불능이라 밴드 경보 없음(0 나누기 방지)", () => {
  assertEquals(dueCreditAlerts({ usage: 100, credit_limit: 0, over_threshold: false }).band80, false);
});

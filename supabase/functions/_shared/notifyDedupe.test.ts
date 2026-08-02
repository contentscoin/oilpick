// [16 L2] shouldNotify 판정 계약 고정. `deno test supabase/functions/_shared/notifyDedupe.test.ts`
import { assertEquals } from "./vendor/std-assert/mod.ts";
import { shouldNotify } from "./notifyDedupe.ts";

const NOW = new Date("2026-08-02T12:00:00Z");
const HOUR = 60 * 60 * 1000;

Deno.test("최근 발송이 없으면 발송 허용", () => {
  assertEquals(shouldNotify([], 2 * HOUR, NOW), true);
});

Deno.test("윈도 안에 발송분이 있으면 스킵", () => {
  assertEquals(
    shouldNotify([{ created_at: "2026-08-02T11:30:00Z" }], 2 * HOUR, NOW),
    false,
  );
});

Deno.test("윈도 경계 — 정확히 windowMs 전 발송분은 아직 윈도 안(스킵)", () => {
  assertEquals(
    shouldNotify([{ created_at: "2026-08-02T10:00:00Z" }], 2 * HOUR, NOW),
    false,
  );
});

Deno.test("윈도 밖(1ms 초과 경과) 발송분만 있으면 발송 허용", () => {
  assertEquals(
    shouldNotify([{ created_at: "2026-08-02T09:59:59.999Z" }], 2 * HOUR, NOW),
    true,
  );
});

Deno.test("여러 행 중 하나라도 윈도 안이면 스킵(정렬 무관)", () => {
  assertEquals(
    shouldNotify(
      [
        { created_at: "2026-08-01T00:00:00Z" },
        { created_at: "2026-08-02T11:59:00Z" },
      ],
      2 * HOUR,
      NOW,
    ),
    false,
  );
});

Deno.test("created_at 파싱 불가 행은 판정 근거에서 무시(알림 영구 차단 방지)", () => {
  assertEquals(shouldNotify([{ created_at: "not-a-date" }], 2 * HOUR, NOW), true);
});

Deno.test("windowMs 0 이하는 dedupe 비활성(항상 발송)", () => {
  assertEquals(
    shouldNotify([{ created_at: "2026-08-02T11:59:59Z" }], 0, NOW),
    true,
  );
});

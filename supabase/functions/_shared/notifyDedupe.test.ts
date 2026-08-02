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

// ── [16 L5] 사다리형 리마인드 판정 ─────────────────────────────────────────
import { ladderDueCount, ladderShouldSend } from "./notifyDedupe.ts";

const ANCHOR = Date.parse("2026-08-02T00:00:00Z"); // 계량 제출 시각
const STAGES = [2 * HOUR, 12 * HOUR]; // 2h/12h 자동 리마인드

const at = (h: number) => new Date(ANCHOR + h * HOUR);

Deno.test("ladderDueCount: 경과별 계단 — 0/1/2", () => {
  assertEquals(ladderDueCount(ANCHOR, STAGES, at(1)), 0);
  assertEquals(ladderDueCount(ANCHOR, STAGES, at(2)), 1);
  assertEquals(ladderDueCount(ANCHOR, STAGES, at(11.9)), 1);
  assertEquals(ladderDueCount(ANCHOR, STAGES, at(12)), 2);
  assertEquals(ladderDueCount(ANCHOR, STAGES, at(48)), 2);
});

Deno.test("ladderShouldSend: 2h 시점 첫 발송, 이후 매분 틱은 중복 발송 없음", () => {
  assertEquals(ladderShouldSend([], ANCHOR, STAGES, at(2)), true);
  const sentAt2h = [{ created_at: new Date(ANCHOR + 2 * HOUR).toISOString() }];
  assertEquals(ladderShouldSend(sentAt2h, ANCHOR, STAGES, at(2.1)), false);
  assertEquals(ladderShouldSend(sentAt2h, ANCHOR, STAGES, at(11)), false);
});

Deno.test("ladderShouldSend: 12h 시점 두 번째 발송, 이후 다시 잠잠", () => {
  const sentAt2h = [{ created_at: new Date(ANCHOR + 2 * HOUR).toISOString() }];
  assertEquals(ladderShouldSend(sentAt2h, ANCHOR, STAGES, at(12)), true);
  const sentBoth = [
    ...sentAt2h,
    { created_at: new Date(ANCHOR + 12 * HOUR).toISOString() },
  ];
  assertEquals(ladderShouldSend(sentBoth, ANCHOR, STAGES, at(13)), false);
  assertEquals(ladderShouldSend(sentBoth, ANCHOR, STAGES, at(48)), false);
});

Deno.test("ladderShouldSend: 재제출로 기산점이 갱신되면 이전 사이클 발송분은 세지 않는다", () => {
  const oldCycleSends = [
    { created_at: new Date(ANCHOR - 10 * HOUR).toISOString() },
    { created_at: new Date(ANCHOR - 5 * HOUR).toISOString() },
  ];
  assertEquals(ladderShouldSend(oldCycleSends, ANCHOR, STAGES, at(2)), true);
});

Deno.test("ladderShouldSend: cron이 한동안 죽었다 살아나도 밀린 만큼 몰아서 2건을 넘지 않는다", () => {
  // 2h·12h를 모두 지나 첫 틱 — due=2, sent=0 → 발송. (틱당 1건씩 — EF가 1건 보낸 뒤 다음 틱에서 재판정)
  assertEquals(ladderShouldSend([], ANCHOR, STAGES, at(20)), true);
  const one = [{ created_at: new Date(ANCHOR + 20 * HOUR).toISOString() }];
  assertEquals(ladderShouldSend(one, ANCHOR, STAGES, at(20.1)), true);
  const two = [...one, { created_at: new Date(ANCHOR + 20.1 * HOUR).toISOString() }];
  assertEquals(ladderShouldSend(two, ANCHOR, STAGES, at(20.2)), false);
});

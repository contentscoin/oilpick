// [16 L8] settlement-watch (cron, 15분 주기 권고 — 02-api.md "23. settlement-watch").
// docs/spec/16-ops-convenience.md §5-3.
//
// 좌상 크레딧 임계·한도 접근을 능동 통지한다 — 예전엔 admin이 /dealer-settlement를 열어야
// over_threshold 배지를 봤고, 놓치면 CONFIRM에서 DEALER_LIMIT_EXCEEDED 하드스톱이 터져
// 라이더·점주가 현장에서 전액 현금 재제출로 수습했다(14 §8).
// **자동청구는 하지 않는다**(14 §4 "자동청구 없음" 확정 불변, L-D5) — 알림까지만 자동화.
// 수신 채널: 좌상·admin 모두 notifications 행 + NotificationsBell(AdminShell 기존 렌더 재사용,
// D1 '별도 앱 없음' 전제에서 벨이 실수신 채널). FCM 미설정 시 push no-op·기록 유지(12 §0-3).
// 중복 발화: sendPushDeduped(kind별 24h 윈도) — L2 알림 계층 단일 메커니즘.
// cron 배선(pg_cron 등)은 배포 설정(16 §0-5) — DEPLOY.md 절차 + 미배선 시 curl 수동 검증.

import { NOTIFY_KIND } from "@oilpick/core/index.ts";
import { AuthError, requireCronAuth } from "../_shared/auth.ts";
import { dueCreditAlerts } from "../_shared/creditWatch.ts";
import { errorResponse, okResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPushDeduped } from "../_shared/push.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 경보 재발화 억제 윈도(24h) — 같은 밴드에 머무는 동안 하루 1회로 제한. */
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    // cron(서버 간) 호출 전제 — service_role 키 직접 인정 + admin JWT 폴백(requireCronAuth, 16 L10).
    let ctx;
    try {
      ctx = await requireCronAuth(req);
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(err.code, err.status, err.message);
      throw err;
    }
    const { admin } = ctx;

    // service_role은 RLS를 우회하므로 invoker 뷰에서도 전 좌상 행이 조회된다.
    const { data: rows, error } = await admin
      .from("v_dealer_statement")
      .select("dealer_id, usage, credit_limit, claim_threshold, over_threshold");
    if (error) throw error;

    let band80Alerts = 0;
    let thresholdAlerts = 0;
    let adminIds: string[] | null = null;
    let dealerNames: Map<string, string> | null = null;

    for (const row of rows ?? []) {
      const alerts = dueCreditAlerts(row);
      if (!alerts.band80 && !alerts.overThreshold) continue;

      // 대상이 있을 때만 수신자·표시명 지연 로드(1회).
      if (adminIds === null) {
        const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
        adminIds = (admins ?? []).map((a: { id: string }) => a.id);
        const { data: dealers } = await admin.from("profiles").select("id, display_name").eq("role", "dealer");
        dealerNames = new Map((dealers ?? []).map((d: { id: string; display_name: string | null }) => [d.id, d.display_name ?? "좌상"]));
      }
      const name = dealerNames?.get(row.dealer_id) ?? "좌상";
      const pct = row.credit_limit > 0 ? Math.floor((row.usage / row.credit_limit) * 100) : 0;

      if (alerts.band80) {
        const sentAny = await notifyDealerAndAdmins(admin, {
          dealerId: row.dealer_id,
          adminIds: adminIds ?? [],
          kind: NOTIFY_KIND.CREDIT_BAND_80,
          dealerCopy: {
            title: "크레딧 한도 임박",
            body: `사용액이 한도의 ${pct}%예요 — 한도가 차면 현장 포인트 지급이 막혀요(현금만 가능).`,
          },
          adminCopy: {
            title: "좌상 크레딧 한도 임박",
            body: `${name} 사용액이 한도의 ${pct}% — 청구 생성을 검토해 주세요.`,
          },
        });
        if (sentAny) band80Alerts++;
      }
      if (alerts.overThreshold) {
        const sentAny = await notifyDealerAndAdmins(admin, {
          dealerId: row.dealer_id,
          adminIds: adminIds ?? [],
          kind: NOTIFY_KIND.CREDIT_OVER_THRESHOLD,
          dealerCopy: {
            title: "정산 청구 예정",
            body: "미정산 사용액이 청구 기준을 넘었어요 — 본사가 곧 청구를 생성해요.",
          },
          adminCopy: {
            title: "좌상 청구 임계 도달",
            body: `${name} 미정산 사용액이 임계를 넘었어요 — 청구 생성이 필요해요.`,
          },
        });
        if (sentAny) thresholdAlerts++;
      }
    }

    return okResponse({ band80Alerts, thresholdAlerts });
  })
);

/** 좌상 본인 + admin 전원에게 kind별 24h dedupe로 발송. 하나라도 실제 발송되면 true. */
async function notifyDealerAndAdmins(
  admin: SupabaseClient,
  opts: {
    dealerId: string;
    adminIds: string[];
    kind: string;
    dealerCopy: { title: string; body: string };
    adminCopy: { title: string; body: string };
  },
): Promise<boolean> {
  let sentAny = false;
  // 좌상: 본인 명세 화면으로. (admin 웹 로그인 — remapToAdminRoute가 아닌 원 경로 표기 유지)
  sentAny =
    (await sendPushDeduped(admin, {
      userId: opts.dealerId,
      kind: opts.kind,
      title: opts.dealerCopy.title,
      body: opts.dealerCopy.body,
      link: "/statement",
      windowMs: ALERT_WINDOW_MS,
    })) || sentAny;
  for (const adminId of opts.adminIds) {
    sentAny =
      (await sendPushDeduped(admin, {
        userId: adminId,
        kind: opts.kind,
        title: opts.adminCopy.title,
        // 좌상별 dedupe 구분은 link가 아니라 body가 아닌 kind+link 키다 — 좌상 식별을 link에 실어
        // (dealer-settlement?dealer=<id>) 좌상 A 경보가 좌상 B 경보를 막지 않게 한다.
        body: opts.adminCopy.body,
        link: `/dealer-settlement?dealer=${opts.dealerId}`,
        windowMs: ALERT_WINDOW_MS,
      })) || sentAny;
  }
  return sentAny;
}

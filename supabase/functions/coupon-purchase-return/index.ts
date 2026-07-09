// coupon-purchase-return (공개 — 코엠 PG 서버 콜백). docs/spec/02-api.md "12-1" (07 F14):
// 코엠 결제창에서 결제가 끝나면 PG가 rUrl(이 함수)로 결과를 form POST한다. 코엠은 서버 승인
// API가 없어 이 콜백이 유일한 확정 경로다 — 토스의 coupon-purchase-confirm ④~⑥에 대응.
//
// 절차: ① form 파싱(parseKoemReturn) → ② orderno(pg_order_id)로 구매건 조회 → ③ 이미 PAID면
// 멱등 성공 화면 → ④ 실패 코드는 FAILED 전이(PENDING만) → ⑤ 승인금액 == 서버 스냅샷 amount
// 검증(불일치 시 취소 시도 + FAILED) → ⑥ fn_confirm_purchase(PENDING→PAID + CHARGE, tid 기록)
// → ⑦ 충전 알림 + 성공 화면. 응답은 결제창 웹뷰에 뜨는 HTML(앱 복귀 딥링크 포함).
//
// 검증 한계(07 F14 확정 설계에 기록): 코엠 결제응답에는 무결성 해시가 없다(문서 3.2.2).
// 방어는 서버 스냅샷 금액 대조 + fn_confirm_purchase 멱등 3중 + tid 저장(환불 시 PG 실검증)
// + admin 일일 대사. verify_jwt=false(supabase/config.toml) — PG는 JWT가 없다.

import { getServiceRoleClient } from "../_shared/auth.ts";
import { errorResponse, withErrorHandling } from "../_shared/response.ts";
import { sendPush } from "../_shared/push.ts";
import { cancelKoemPayment, parseKoemReturn } from "../_shared/koem.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/** PENDING인 구매 건만 FAILED로 전이(coupon-purchase-confirm과 동일 패턴). */
async function markFailed(admin: SupabaseClient, purchaseId: string): Promise<void> {
  const { error } = await admin
    .from("coupon_purchases")
    .update({ status: "FAILED" })
    .eq("id", purchaseId)
    .eq("status", "PENDING");
  if (error) console.error("coupon_purchases FAILED 전이 실패", error);
}

/** 확정 실패 시 코엠 취소 best-effort(실패해도 로그만 — 수동 대사 대상). */
async function tryCancel(tid: string, amount: number, reason: string): Promise<void> {
  try {
    await cancelKoemPayment(tid, { cancelReason: reason, cancelAmount: amount });
  } catch (err) {
    console.error("코엠 취소 시도 실패(수동 대사 필요)", err);
  }
}

/** 결제창 웹뷰에 표시할 결과 HTML. returnAppUrl 스킴이 있으면 앱 복귀를 시도한다. */
function htmlResponse(ok: boolean, message: string): Response {
  const appUrl = Deno.env.get("KOEM_RETURN_APP_URL");
  const title = ok ? "쿠폰 충전 완료" : "결제를 완료하지 못했어요";
  const appLink = appUrl
    ? `<p><a href="${appUrl}">앱으로 돌아가기</a></p><script>location.href=${JSON.stringify(appUrl)};</script>`
    : "<p>앱으로 돌아가 잔액을 확인해 주세요.</p>";
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px;">
<h1 style="font-size:18px;">${title}</h1><p>${message}</p>${appLink}</body></html>`;
  // PG 재시도 유발을 피하기 위해 결과와 무관하게 200으로 응답(성패는 화면·원장으로 전달).
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve((req) =>
  withErrorHandling(req, async (req) => {
    if (req.method !== "POST") {
      return errorResponse("NOT_FOUND", 404, "지원하지 않는 메서드예요.");
    }

    // ① rUrl 콜백 파싱(application/x-www-form-urlencoded, 문서 3.2.2).
    const form = new URLSearchParams(await req.text());
    const payload = parseKoemReturn(form);
    if (!payload.orderno) {
      // 결제창 내 사용자 취소(문서 3.3.1)는 RESULT_CODE(EC9000)만 오고 orderno가 없다 —
      // 구매건 특정 불가(PENDING은 24h TTL이 정리). 웹뷰에 안내 HTML만 반환.
      if (payload.resultCode) {
        return htmlResponse(false, payload.resultMsg || "결제가 취소되었어요.");
      }
      return errorResponse("VALIDATION_ERROR", 400, "orderno가 없어요.");
    }

    const admin = getServiceRoleClient();

    // ② 구매건 조회 — orderno는 intent가 발급한 pg_order_id(unique).
    const { data: purchase, error: loadErr } = await admin
      .from("coupon_purchases")
      .select("id, rider_id, qty, amount, status")
      .eq("pg_order_id", payload.orderno)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!purchase) {
      console.error("coupon-purchase-return: 미존재 orderno", payload.orderno);
      return errorResponse("NOT_FOUND", 404);
    }

    // ③ 이미 PAID — 멱등(콜백 재전송/새로고침). 이중 충전 없음(fn_confirm_purchase 3중 방어).
    if (purchase.status === "PAID") {
      return htmlResponse(true, `수거쿠폰 ${purchase.qty}장이 충전되어 있어요.`);
    }

    // ④ 결제 실패/사용자 취소(EC9000 등) → PENDING이면 FAILED 전이.
    if (!payload.ok) {
      await markFailed(admin, purchase.id as string);
      return htmlResponse(false, payload.resultMsg || "결제가 취소되었거나 승인에 실패했어요.");
    }

    if (purchase.status !== "PENDING") {
      // EXPIRED/FAILED/REFUNDED 상태에서 승인 콜백 도착 — 승인은 됐으므로 취소 시도(대사).
      if (payload.tid) await tryCancel(payload.tid, purchase.amount as number, "만료된 구매 건");
      return htmlResponse(false, "이미 종료된 구매 건이에요. 결제 금액은 취소 처리돼요.");
    }

    // ⑤ 승인금액 == 서버 스냅샷(위조·변조 방어의 핵심 — 07 §1-4). 불일치는 취소 + FAILED.
    if (payload.approvamt !== purchase.amount || !payload.tid) {
      if (payload.tid) await tryCancel(payload.tid, purchase.amount as number, "승인 금액 불일치");
      await markFailed(admin, purchase.id as string);
      console.error("coupon-purchase-return: 승인 금액 불일치", {
        orderno: payload.orderno,
        approvamt: payload.approvamt,
        expected: purchase.amount,
      });
      return htmlResponse(false, "결제 금액이 일치하지 않아 취소 처리돼요.");
    }

    // ⑥ 확정 RPC(원자): PENDING→PAID + payment_key(tid) + CHARGE. 재호출/동시성 멱등.
    const { error: rpcErr } = await admin.rpc("fn_confirm_purchase", {
      p_purchase_id: purchase.id,
      p_payment_key: payload.tid,
    });
    if (rpcErr) {
      await tryCancel(payload.tid, purchase.amount as number, "충전 처리 실패");
      await markFailed(admin, purchase.id as string);
      console.error("coupon-purchase-return: fn_confirm_purchase 실패", rpcErr);
      return htmlResponse(false, "충전 처리에 실패해 결제를 취소했어요. 고객센터에 문의해 주세요.");
    }

    // ⑦ 충전 알림(07 §1-6, coupon-purchase-confirm ⑥과 동일 카피).
    await sendPush(
      admin,
      [purchase.rider_id as string],
      "쿠폰 충전 완료",
      `쿠폰 ${purchase.qty}장 충전 완료`,
      "/coupons/purchase",
    );

    return htmlResponse(true, `수거쿠폰 ${purchase.qty}장이 충전되었어요.`);
  })
);

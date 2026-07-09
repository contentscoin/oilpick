// koem.ts 네트워크 없는 검증(07 F14). checkHash는 문서 3.1.2.1의 공식 예시 벡터로 고정하고,
// 결제창 파라미터·rUrl 콜백 파서·취소 요청 형태(JSON/checkHash/tax_yn)·에러 매핑을 확인한다.
// `deno test supabase/functions/_shared/koem.test.ts`로 실행.
import { assert, assertEquals, assertRejects, assertThrows } from "./vendor/std-assert/mod.ts";
import {
  buildKoemPayParams,
  cancelKoemPayment,
  koemAdapter,
  koemCheckHash,
  koemOrderDateTime,
  parseKoemReturn,
  resolveKoemConfig,
} from "./koem.ts";
import { type FetchLike, PgApiError } from "./pg.ts";

const TEST_CONFIG = {
  mid: "M20210309113515",
  apiKey: "ef5df61805ea166bb16867a9bf566082836f090bc6d0c1c58700fa1b203761c0",
  pgDomain: "https://test-pay.coam.co.kr:30300",
  approvDomain: "https://183.111.29.87:39500",
  payGroup: "OPG",
  payBrand: "OCC",
};

function fakeFetch(
  capture: { url?: string; init?: RequestInit },
  response: { status: number; body: unknown },
): FetchLike {
  return (url, init) => {
    capture.url = url;
    capture.init = init;
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}

Deno.test("koemCheckHash: 문서 3.1.2.1 공식 예시 벡터와 일치", async () => {
  // message: ORDER12345 + 20190717 + 101500 + 5000, key: 문서 예시 API_KEY.
  const hash = await koemCheckHash("ORDER12345201907171015005000", TEST_CONFIG.apiKey);
  assertEquals(hash, "H3exIoGK4Fw+buY2C0uM1UpMuPMqk+RZqypHISbNC3g=");
});

Deno.test("koemOrderDateTime: KST 벽시계 YYYYMMDD/HHMMSS", () => {
  // 2026-07-09T15:30:05Z = KST 2026-07-10 00:30:05 (자정 넘김 케이스).
  const { orderdt, ordertm } = koemOrderDateTime(new Date("2026-07-09T15:30:05Z"));
  assertEquals(orderdt, "20260710");
  assertEquals(ordertm, "003005");
});

Deno.test("buildKoemPayParams: 필수 필드 + checkHash 자기일관 + orderno 길이 가드", async () => {
  const { payUrl, params } = await buildKoemPayParams(
    { pgOrderId: "op123456789012345678", amount: 60000, qty: 30, purchaseId: "pu-uuid-1" },
    { returnUrl: "https://x.functions.supabase.co/coupon-purchase-return", returnAppUrl: "oilpickrider://" },
    TEST_CONFIG,
  );
  assertEquals(payUrl, "https://test-pay.coam.co.kr:30300/mobilepage/common/mainFrame.pay");
  assertEquals(params.mid, TEST_CONFIG.mid);
  assertEquals(params.rMethod, "POST");
  assertEquals(params.payGroup, "OPG");
  assertEquals(params.payBrand, "OCC");
  assertEquals(params.buyItemnm, "수거쿠폰 30장");
  assertEquals(params.buyReqamt, "60000");
  assertEquals(params.orderno, "op123456789012345678");
  assertEquals(params.reserved01, "pu-uuid-1");
  assertEquals(params.returnAppUrl, "oilpickrider://");
  // checkHash = HMAC(orderno+orderdt+ordertm+buyReqamt) — 폼 값 기준으로 재계산해 일치 확인.
  const expected = await koemCheckHash(
    `${params.orderno}${params.orderdt}${params.ordertm}${params.buyReqamt}`,
    TEST_CONFIG.apiKey,
  );
  assertEquals(params.checkHash, expected);

  // 응답 규격 Max 20 초과 orderno는 거부.
  await assertRejects(
    () =>
      buildKoemPayParams(
        { pgOrderId: "oc_0123456789012345678901234567890123456", amount: 1, qty: 1, purchaseId: "p" },
        { returnUrl: "https://r" },
        TEST_CONFIG,
      ),
    Error,
    "20자",
  );
});

Deno.test("parseKoemReturn: 정상/샘플 표기(approamt)/실패 코드", () => {
  const ok = parseKoemReturn(
    new URLSearchParams({
      result_code: "EC0000",
      result_msg: "성공",
      tid: "250220101805973",
      orderno: "op123",
      approvamt: "60000",
      reserved01: "pu-1",
    }),
  );
  assert(ok.ok);
  assertEquals(ok.tid, "250220101805973");
  assertEquals(ok.approvamt, 60000);

  // 샘플 simple_return.jsp 표기(approamt)도 수용.
  const sample = parseKoemReturn(
    new URLSearchParams({ result_code: "EC0000", tid: "t1", orderno: "o1", approamt: "5000" }),
  );
  assertEquals(sample.approvamt, 5000);

  const fail = parseKoemReturn(
    new URLSearchParams({ result_code: "EC9000", dresult_msg: "사용자 결제 취소", orderno: "o1" }),
  );
  assertEquals(fail.ok, false);
  assertEquals(fail.resultMsg, "사용자 결제 취소");
  assertEquals(fail.approvamt, null);
});

Deno.test("cancelKoemPayment: 취소 URL/JSON 바디(checkHash·tax_yn) + 성공 매핑", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    status: 200,
    body: {
      result_code: "EC0000",
      result_msg: "성공",
      tid: "250220101805973",
      cancel_tid: "250220101805974",
      cancel_amt: "60000",
      orderno: "op123",
    },
  });

  const payment = await cancelKoemPayment(
    "250220101805973",
    { cancelReason: "CS 환불", cancelAmount: 60000 },
    { fetchImpl, config: TEST_CONFIG },
  );

  assertEquals(cap.url, "https://183.111.29.87:39500/api/cc/approv/cancel");
  const body = JSON.parse(cap.init?.body as string);
  assertEquals(body.mid, TEST_CONFIG.mid);
  assertEquals(body.pay_method, "CC");
  assertEquals(body.tid, "250220101805973");
  assertEquals(body.cancel_amt, "60000");
  assertEquals(body.tax_yn, "Y");
  // checkHash = HMAC(tid+mid+cancel_amt) — 샘플 card_cancel_return.jsp 규칙.
  assertEquals(
    body.checkHash,
    await koemCheckHash(`250220101805973${TEST_CONFIG.mid}60000`, TEST_CONFIG.apiKey),
  );
  assertEquals(payment.status, "CANCELED");
  assertEquals(payment.totalAmount, 60000);
  assertEquals(payment.paymentKey, "250220101805973");

  // 취소 금액 누락은 API 호출 전에 거부(코엠은 cancel_amt 필수).
  await assertRejects(
    () => cancelKoemPayment("t1", { cancelReason: "r" }, { fetchImpl, config: TEST_CONFIG }),
    PgApiError,
    "취소 금액",
  );
});

Deno.test("cancelKoemPayment: HTTP 200 + 실패 result_code → PgApiError(code 매핑)", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    status: 200,
    body: { result_code: "EC1088", result_msg: "부분 취소 불가" },
  });
  const err = await assertRejects(
    () =>
      cancelKoemPayment("t1", { cancelReason: "r", cancelAmount: 100 }, {
        fetchImpl,
        config: TEST_CONFIG,
      }),
    PgApiError,
  );
  assertEquals(err.code, "EC1088");
  assertEquals(err.httpStatus, 402);
});

Deno.test("koemAdapter: confirm 미지원 명시 실패 + isAlreadyProcessed 항상 false", async () => {
  const err = await assertRejects(
    () => koemAdapter.confirmPayment({ paymentKey: "t", orderId: "o", amount: 1 }),
    PgApiError,
  );
  assertEquals(err.code, "NOT_SUPPORTED");
  assertEquals(koemAdapter.isAlreadyProcessed(new PgApiError("EC0000", "x", 200)), false);
  assertEquals(koemAdapter.provider, "koem");
});

Deno.test("resolveKoemConfig: mid/apiKey 미설정 시 명시적 실패 + 도메인 기본값 상용기", () => {
  assertThrows(() => resolveKoemConfig({ mid: "", apiKey: "" }), Error, "KOEM_MID");
  const cfg = resolveKoemConfig({ mid: "M1", apiKey: "k" });
  assertEquals(cfg.pgDomain, "https://pay.coam.co.kr");
  assertEquals(cfg.approvDomain, "https://paycc.coam.co.kr");
  assertEquals(cfg.payGroup, "OPG");
  assertEquals(cfg.payBrand, "OCC");
});

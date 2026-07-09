// toss.ts 네트워크 없는 검증(07 F4). 주입 fetch로 요청 형태(URL/메서드/Basic 인증/바디)와
// 성공·실패 매핑을 확인한다. `deno test supabase/functions/_shared/toss.test.ts`로 실행.
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  confirmTossPayment,
  cancelTossPayment,
  TossApiError,
  type FetchLike,
} from "./toss.ts";

function fakeFetch(
  capture: { url?: string; init?: RequestInit },
  response: { ok: boolean; status: number; body: unknown },
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

Deno.test("confirmTossPayment: confirm 엔드포인트 + Basic 인증 + 바디", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    ok: true,
    status: 200,
    body: { paymentKey: "tk_1", orderId: "oc_1", status: "DONE", totalAmount: 5000 },
  });

  const payment = await confirmTossPayment(
    { paymentKey: "tk_1", orderId: "oc_1", amount: 5000 },
    { secretKey: "test_sk_abc", fetchImpl },
  );

  assertEquals(payment.totalAmount, 5000);
  assertEquals(cap.url, "https://api.tosspayments.com/v1/payments/confirm");
  assertEquals(cap.init?.method, "POST");
  const headers = cap.init?.headers as Record<string, string>;
  // Basic base64("test_sk_abc:")
  assertEquals(headers.Authorization, `Basic ${btoa("test_sk_abc:")}`);
  assertEquals(JSON.parse(cap.init?.body as string), {
    paymentKey: "tk_1",
    orderId: "oc_1",
    amount: 5000,
  });
});

Deno.test("confirmTossPayment: 비2xx → TossApiError(code/message 매핑)", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    ok: false,
    status: 400,
    body: { code: "ALREADY_PROCESSED_PAYMENT", message: "이미 처리된 결제 입니다." },
  });

  const err = await assertRejects(
    () =>
      confirmTossPayment(
        { paymentKey: "tk_1", orderId: "oc_1", amount: 5000 },
        { secretKey: "test_sk_abc", fetchImpl },
      ),
    TossApiError,
  );
  assertEquals(err.code, "ALREADY_PROCESSED_PAYMENT");
  assertEquals(err.httpStatus, 400);
});

Deno.test("cancelTossPayment: 부분 취소 cancelAmount + paymentKey 경로", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    ok: true,
    status: 200,
    body: { paymentKey: "tk_1", orderId: "oc_1", status: "CANCELED", totalAmount: 5000 },
  });

  await cancelTossPayment("tk_1", { cancelReason: "CS 환불", cancelAmount: 2000 }, {
    secretKey: "test_sk_abc",
    fetchImpl,
  });

  assertEquals(cap.url, "https://api.tosspayments.com/v1/payments/tk_1/cancel");
  assertEquals(JSON.parse(cap.init?.body as string), {
    cancelReason: "CS 환불",
    cancelAmount: 2000,
  });
});

Deno.test("cancelTossPayment: cancelAmount 생략 시 전액 취소(바디에 미포함)", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const fetchImpl = fakeFetch(cap, {
    ok: true,
    status: 200,
    body: { paymentKey: "tk_1", orderId: "oc_1", status: "CANCELED", totalAmount: 5000 },
  });

  await cancelTossPayment("tk_1", { cancelReason: "전액 환불" }, {
    secretKey: "test_sk_abc",
    fetchImpl,
  });

  assertEquals(JSON.parse(cap.init?.body as string), { cancelReason: "전액 환불" });
});

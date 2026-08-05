// 코엠페이먼츠(coam.co.kr) SIMPLEPAY PG 어댑터 (07 F14, [17 Q2] 쿠폰 복권으로 a4b4fdd^에서
// 재복원 — 17 C3가 기본 PG로 확정). 근거 문서: "PG 결제연동 가이드
// (SIMPLEPAY) v1.14" + 공식 JSP 샘플(simplepay.zip) — docs/spec/07-pivot-plan.md F14 확정 설계.
//
// 코엠은 토스와 달리 서버 승인(confirm) API가 없는 결제창 리다이렉트형이다:
//   결제창 form POST(가맹점) → 사용자 결제(PG 페이지) → PG가 rUrl로 결과를 form POST(서버 콜백).
// 따라서 confirmPayment는 명시적으로 실패하고(클라이언트 확정 경로 차단), 승인 확정은
// coupon-purchase-return(rUrl 수신 함수)이 담당한다. 취소만 server-to-server JSON API.
//
// 시크릿(KOEM_MID·KOEM_API_KEY)은 Deno.env(supabase secrets)에서만 읽는다(절대 규칙 3의 확장).
// 유의: 결제응답(rUrl 콜백)에는 무결성 해시가 없다(문서 3.2.2 — checkHash는 요청 전용).
// 위조 방어는 서버 스냅샷 금액 대조 + tid 저장(환불 시 PG가 실검증) + admin 일일 대사로 하며,
// 한계와 후속(코엠에 조회/노티 해시 문의)은 07 F14에 기록되어 있다.

import { PgApiError, type PgAdapter, type PgDeps, type PgPayment } from "./pg.ts";

/** 취소 요청 경로(문서 5.4 — 신용카드). 도메인은 KOEM_APPROV_DOMAIN(기본 상용기). */
const CANCEL_PATH = "/api/cc/approv/cancel";
/** 결제창 경로(문서 5.3 — 모바일). rider 앱은 모바일 웹뷰라 mobilepage 고정. */
const PAYPAGE_PATH = "/mobilepage/common/mainFrame.pay";

/** 코엠 성공 결과코드(문서 5.9). HTTP 200이어도 result_code로 성패를 판단한다. */
const KOEM_OK = "EC0000";

export interface KoemConfig {
  mid: string;
  apiKey: string;
  /** 결제창 도메인(문서 5.1). 기본 상용기. */
  pgDomain: string;
  /** 승인(취소)서버 도메인(문서 5.2). 기본 상용기. */
  approvDomain: string;
  /** 결제그룹(문서 5.6 코드표는 OPG, 샘플 기본값은 GEP — 계약에 따라 env로 조정). */
  payGroup: string;
  /** 결제브랜드(문서 5.7). 기본 일반신용 OCC. */
  payBrand: string;
}

/** env에서 코엠 설정을 읽는다. mid/apiKey 미설정 시 명시적 실패(휴면 게이트). */
export function resolveKoemConfig(overrides?: Partial<KoemConfig>): KoemConfig {
  const mid = overrides?.mid ?? Deno.env.get("KOEM_MID");
  const apiKey = overrides?.apiKey ?? Deno.env.get("KOEM_API_KEY");
  if (!mid || !apiKey) {
    throw new Error("KOEM_MID/KOEM_API_KEY 시크릿이 설정되지 않았어요(supabase secrets).");
  }
  return {
    mid,
    apiKey,
    pgDomain: overrides?.pgDomain ?? Deno.env.get("KOEM_PG_DOMAIN") ?? "https://pay.coam.co.kr",
    approvDomain:
      overrides?.approvDomain ?? Deno.env.get("KOEM_APPROV_DOMAIN") ?? "https://paycc.coam.co.kr",
    payGroup: overrides?.payGroup ?? Deno.env.get("KOEM_PAY_GROUP") ?? "OPG",
    payBrand: overrides?.payBrand ?? Deno.env.get("KOEM_PAY_BRAND") ?? "OCC",
  };
}

/**
 * 유효성 검증 Hash(문서 3.1.2.1): HMAC-SHA256(message, API_KEY)의 Base64.
 * 결제요청 message = orderno+orderdt+ordertm+buyReqamt, 취소 message = tid+mid+cancel_amt.
 */
export async function koemCheckHash(message: string, apiKey: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** KST(Asia/Seoul) 기준 주문일자/시간 — checkHash 입력과 폼 값이 반드시 동일해야 한다. */
export function koemOrderDateTime(now = new Date()): { orderdt: string; ordertm: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString(); // 2026-07-09T21:15:00.000Z(+9 보정된 벽시계)
  return {
    orderdt: iso.slice(0, 10).replaceAll("-", ""),
    ordertm: iso.slice(11, 19).replaceAll(":", ""),
  };
}

export interface KoemPayParams {
  /** 결제창 form POST 대상 URL(모바일). */
  payUrl: string;
  /** 결제창 form 필드 전체(checkHash 포함) — 클라이언트는 그대로 hidden form submit. */
  params: Record<string, string>;
}

/**
 * 결제창 진입 form 파라미터 생성(문서 3.2.1). checkHash에 API_KEY가 필요하므로 반드시 서버에서
 * 만들고, 클라이언트는 반환된 필드를 수정 없이 제출한다(금액 진실은 서버 스냅샷 — 07 §1-4).
 * orderno는 응답 규격이 Max 20(요청은 65)이라 20자 이내 pg_order_id를 사용해야 한다.
 */
export async function buildKoemPayParams(
  purchase: { pgOrderId: string; amount: number; qty: number; purchaseId: string },
  opts: { returnUrl: string; returnAppUrl?: string },
  config?: Partial<KoemConfig>,
): Promise<KoemPayParams> {
  const cfg = resolveKoemConfig(config);
  if (purchase.pgOrderId.length > 20) {
    throw new Error("코엠 orderno는 20자 이내여야 해요(응답 규격 Max 20).");
  }
  const { orderdt, ordertm } = koemOrderDateTime();
  const buyReqamt = String(purchase.amount);
  const checkHash = await koemCheckHash(
    `${purchase.pgOrderId}${orderdt}${ordertm}${buyReqamt}`,
    cfg.apiKey,
  );
  const params: Record<string, string> = {
    mid: cfg.mid,
    rUrl: opts.returnUrl,
    rMethod: "POST",
    payGroup: cfg.payGroup,
    payType: "CC",
    payBrand: cfg.payBrand,
    buyItemnm: `수거쿠폰 ${purchase.qty}장`,
    buyReqamt,
    orderno: purchase.pgOrderId,
    orderdt,
    ordertm,
    checkHash,
    // 콜백에서 구매건 역추적 보조(orderno가 1차 키, reserved01은 이중화).
    reserved01: purchase.purchaseId,
  };
  if (opts.returnAppUrl) params.returnAppUrl = opts.returnAppUrl;
  return { payUrl: `${cfg.pgDomain}${PAYPAGE_PATH}`, params };
}

/** rUrl 콜백(결제응답, 문서 3.2.2)에서 확정에 필요한 필드만 추린 형태. */
export interface KoemReturnPayload {
  resultCode: string;
  resultMsg: string;
  tid: string;
  orderno: string;
  /** 승인금액(신용카드 성공 시). 문서는 approvamt, 샘플 JSP는 approamt — 둘 다 수용. */
  approvamt: number | null;
  reserved01: string;
  ok: boolean;
}

/** rUrl 콜백 form 필드 파싱(대소문자·표기 편차 방어). */
export function parseKoemReturn(form: URLSearchParams): KoemReturnPayload {
  const get = (...names: string[]): string => {
    for (const n of names) {
      const v = form.get(n) ?? form.get(n.toUpperCase()) ?? form.get(n.toLowerCase());
      if (v != null && v !== "") return v;
    }
    return "";
  };
  const resultCode = get("result_code");
  const amtRaw = get("approvamt", "approamt");
  const amt = amtRaw === "" ? null : Number(amtRaw);
  return {
    resultCode,
    resultMsg: get("result_msg", "dresult_msg"),
    tid: get("tid"),
    orderno: get("orderno"),
    approvamt: amt != null && Number.isFinite(amt) ? amt : null,
    reserved01: get("reserved01"),
    ok: resultCode === KOEM_OK,
  };
}

/**
 * 결제 취소(문서 3.2.3, 샘플 card_cancel_return.jsp 준거) — server-to-server JSON.
 * checkHash 키 표기는 문서 표(checkhash)와 샘플(checkHash)이 다르다 — 동작 코드인 샘플을 따른다.
 * tax_yn="Y"(PG 자동계산, 문서 v1.14 필수 항목 — 샘플엔 없으나 규격 준수).
 * 부분취소 거부(EC1088) 등 실패는 result_code 그대로 PgApiError로 던진다.
 */
export async function cancelKoemPayment(
  tid: string,
  params: { cancelReason: string; cancelAmount?: number },
  deps?: PgDeps & { config?: Partial<KoemConfig> },
): Promise<PgPayment> {
  const cfg = resolveKoemConfig(deps?.config ?? (deps?.secretKey ? { apiKey: deps.secretKey } : undefined));
  if (params.cancelAmount == null) {
    // 코엠 취소는 cancel_amt 필수(전액 취소도 금액 지정) — 호출부가 금액을 알고 있어야 한다.
    throw new PgApiError("VALIDATION_ERROR", "코엠 취소는 취소 금액이 필요해요.", 400);
  }
  const fetchImpl = deps?.fetchImpl ?? globalThis.fetch;
  const cancelAmt = String(params.cancelAmount);
  const checkHash = await koemCheckHash(`${tid}${cfg.mid}${cancelAmt}`, cfg.apiKey);

  const res = await fetchImpl(`${cfg.approvDomain}${CANCEL_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8", Accept: "application/json" },
    body: JSON.stringify({
      mid: cfg.mid,
      pay_method: "CC",
      tid,
      cancel_amt: cancelAmt,
      tax_yn: "Y",
      reserved01: params.cancelReason.slice(0, 1024),
      checkHash,
    }),
  });

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // 바디 파싱 실패 시 아래 result_code 부재 분기로 처리.
  }
  const resultCode = String(body.result_code ?? "");
  if (!res.ok || resultCode !== KOEM_OK) {
    throw new PgApiError(
      resultCode || "UNKNOWN",
      String(body.result_msg ?? `코엠 취소 API 오류(${res.status})`),
      res.ok ? 402 : res.status,
    );
  }
  return {
    paymentKey: tid,
    orderId: String(body.orderno ?? ""),
    status: "CANCELED",
    totalAmount: Number(body.cancel_amt ?? cancelAmt),
    cancelTid: body.cancel_tid,
  };
}

/** pg.ts 계약 구현체 — getPgAdapter("koem")가 반환한다. */
export const koemAdapter: PgAdapter = {
  provider: "koem",
  // 코엠은 서버 승인 API가 없다(결제창 승인 → rUrl 콜백이 확정 경로). 클라이언트發 confirm은
  // coupon-purchase-confirm에서 이 에러로 PAYMENT_FAILED 402가 된다.
  confirmPayment: () =>
    Promise.reject(
      new PgApiError(
        "NOT_SUPPORTED",
        "코엠 결제는 결제창에서 승인되고 서버 콜백으로 자동 확정돼요.",
        400,
      ),
    ),
  cancelPayment: cancelKoemPayment,
  // 승인 멱등 판정은 rUrl 콜백(fn_confirm_purchase 상태 기반)이 담당 — 어댑터 레벨 판정 없음.
  isAlreadyProcessed: () => false,
};

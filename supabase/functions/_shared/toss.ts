// 토스페이먼츠 결제 API 계층 (07 F4). 02-api.md `coupon-purchase-confirm`/`coupon-refund`.
//
// 승인(confirm)·취소(cancel) 두 엔드포인트만 감싼다. 네트워크 없이 검증 가능하도록 fetch를
// 주입 가능한 구조로 둔다(기본값 globalThis.fetch). 시크릿 키는 Deno.env(supabase secrets)
// `TOSS_SECRET_KEY`에서만 읽고 코드에 리터럴로 두지 않는다(절대 규칙 3의 확장, 07 §1-4).
//
// 토스 인증: Basic base64(`${secretKey}:`) — 시크릿 키 뒤 콜론, 비밀번호는 빈 문자열.
// (토스 공식: "시크릿 키 뒤에 콜론을 추가하고 base64로 인코딩".)

const TOSS_BASE = "https://api.tosspayments.com/v1/payments";

/** 주입 가능한 fetch 시그니처(Deno/브라우저 fetch 호환 최소 형태). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TossDeps {
  /** 시크릿 키. 미지정 시 Deno.env `TOSS_SECRET_KEY`. */
  secretKey?: string;
  /** 주입 fetch. 미지정 시 globalThis.fetch(테스트에서 가짜 주입). */
  fetchImpl?: FetchLike;
}

/** 토스 승인/취소 응답 중 확정에 필요한 필드(그 외 필드는 무시). */
export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  [key: string]: unknown;
}

/** 토스 API 실패(비 2xx 응답 또는 네트워크 오류). code/message는 토스 에러 바디에서 온다. */
export class TossApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = "TossApiError";
  }
}

function resolveSecretKey(deps?: TossDeps): string {
  const key = deps?.secretKey ?? Deno.env.get("TOSS_SECRET_KEY");
  if (!key) {
    throw new Error("TOSS_SECRET_KEY 시크릿이 설정되지 않았어요(supabase secrets).");
  }
  return key;
}

function basicAuthHeader(secretKey: string): string {
  // btoa는 Deno 전역에서 사용 가능. 시크릿 키 뒤에 콜론(":") 추가 후 base64.
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function parseError(res: Response): Promise<TossApiError> {
  let code = "UNKNOWN";
  let message = `토스 API 오류(${res.status})`;
  try {
    const body = await res.json();
    if (body?.code) code = String(body.code);
    if (body?.message) message = String(body.message);
  } catch {
    // 바디 파싱 실패 시 기본 메시지 유지.
  }
  return new TossApiError(code, message, res.status);
}

/**
 * 결제 승인(confirm). 결제위젯이 승인 대기 상태로 만든 결제를 최종 승인한다.
 * 성공 시 TossPayment(status='DONE', totalAmount 등) 반환. 실패 시 TossApiError throw.
 * amount 일치 검증은 호출부(Edge)가 반환값 totalAmount == 기대 amount로 수행한다.
 */
export async function confirmTossPayment(
  params: { paymentKey: string; orderId: string; amount: number },
  deps?: TossDeps,
): Promise<TossPayment> {
  const secretKey = resolveSecretKey(deps);
  const fetchImpl = deps?.fetchImpl ?? (globalThis.fetch as FetchLike);

  const res = await fetchImpl(`${TOSS_BASE}/confirm`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      amount: params.amount,
    }),
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as TossPayment;
}

/**
 * 결제 취소(cancel). 승인된 결제를 (부분) 취소한다 — PG 환불.
 * cancelAmount 지정 시 부분 취소, 생략 시 전액 취소. 성공 시 TossPayment 반환.
 */
export async function cancelTossPayment(
  paymentKey: string,
  params: { cancelReason: string; cancelAmount?: number },
  deps?: TossDeps,
): Promise<TossPayment> {
  const secretKey = resolveSecretKey(deps);
  const fetchImpl = deps?.fetchImpl ?? (globalThis.fetch as FetchLike);

  const body: Record<string, unknown> = { cancelReason: params.cancelReason };
  if (params.cancelAmount != null) body.cancelAmount = params.cancelAmount;

  const res = await fetchImpl(`${TOSS_BASE}/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as TossPayment;
}

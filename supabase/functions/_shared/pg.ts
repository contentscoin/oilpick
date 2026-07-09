// PG 결제 어댑터 계약 + 선택 (07 F14-①). 승인(confirm)·취소(cancel) 계약은 F4에서 확정된
// 것을 그대로 유지하고, coupon-purchase-confirm/coupon-refund는 이 인터페이스로만 PG를
// 호출한다 — 쿠폰 원장·상태머신은 PG 중립(07 §1-4)이라 어댑터 교체만으로 PG를 바꾼다.
//
// 구현체 규칙: 네트워크 없이 검증 가능하도록 fetch 주입(PgDeps.fetchImpl)을 받고, 시크릿
// 키는 Deno.env(supabase secrets)에서만 읽는다(절대 규칙 3의 확장).
// 코엠은 서버 승인 API가 없는 결제창 리다이렉트형이라 confirmPayment가 명시 실패한다 —
// 확정 경로는 coupon-purchase-return(rUrl 콜백). 상세는 koem.ts와 07 F14 확정 설계 참고.
//
// toss.ts/koem.ts와 순환 import지만 서로 런타임(함수 호출 시점) 참조만 있어 안전하다.

import { tossAdapter } from "./toss.ts";
import { koemAdapter } from "./koem.ts";

/** 주입 가능한 fetch 시그니처(Deno/브라우저 fetch 호환 최소 형태). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PgDeps {
  /** 시크릿 키. 미지정 시 어댑터별 Deno.env 시크릿(토스: TOSS_SECRET_KEY). */
  secretKey?: string;
  /** 주입 fetch. 미지정 시 globalThis.fetch(테스트에서 가짜 주입). */
  fetchImpl?: FetchLike;
}

/** PG 승인/취소 응답 중 확정에 필요한 공통 필드(그 외 필드는 무시). */
export interface PgPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  [key: string]: unknown;
}

/** PG API 실패(비 2xx 응답 또는 네트워크 오류). code/message는 PG 에러 바디에서 온다. */
export class PgApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = "PgApiError";
  }
}

export interface PgAdapter {
  /** PG 식별자(로그·설정용). demo는 시연·개발 전용 가짜 PG(07 F14 데모 운영 결정). */
  provider: "toss" | "koem" | "demo";
  /**
   * 결제 승인. 성공 시 PgPayment 반환, 실패 시 PgApiError throw.
   * amount 일치 검증은 호출부(Edge)가 반환값 totalAmount == 기대 amount로 수행한다.
   */
  confirmPayment(
    params: { paymentKey: string; orderId: string; amount: number },
    deps?: PgDeps,
  ): Promise<PgPayment>;
  /** 결제 (부분) 취소 — PG 환불. cancelAmount 생략 시 전액 취소. */
  cancelPayment(
    paymentKey: string,
    params: { cancelReason: string; cancelAmount?: number },
    deps?: PgDeps,
  ): Promise<PgPayment>;
  /** "이미 승인된 결제" 에러 여부(재시도·동시 confirm의 승자 → 멱등 확정으로 진행). */
  isAlreadyProcessed(err: unknown): boolean;
}

/**
 * 데모 어댑터(07 F14 데모 운영, CEO 2026-07-09): 코엠 실연결(키 발급·IP 협의) 전까지 결제
 * 시연용. PG 외부 호출만 즉시 성공으로 대체하고 원장·상태머신·멱등은 실경로 그대로 탄다
 * (fn_confirm_purchase / fn_refund_purchase). **실 과금이 없으므로 프로덕션(실 라이더) 금지** —
 * DEPLOY.md 경고 참고. confirm의 amount 대조는 요청 값을 그대로 반환해 통과시킨다(호출부가
 * 서버 스냅샷 amount로 호출하므로 스냅샷 진실 원칙은 유지).
 */
export const demoAdapter: PgAdapter = {
  provider: "demo",
  confirmPayment: (params) =>
    Promise.resolve({
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      status: "DONE",
      totalAmount: params.amount,
    }),
  cancelPayment: (paymentKey, params) =>
    Promise.resolve({
      paymentKey,
      orderId: "",
      status: "CANCELED",
      totalAmount: params.cancelAmount ?? 0,
    }),
  isAlreadyProcessed: () => false,
};

/** 활성 PG 어댑터 선택. provider 미지정 시 Deno.env `PG_PROVIDER`(기본 toss). */
export function getPgAdapter(provider?: string): PgAdapter {
  const selected = provider ?? Deno.env.get("PG_PROVIDER") ?? "toss";
  switch (selected) {
    case "toss":
      return tossAdapter;
    case "koem":
      return koemAdapter;
    case "demo":
      return demoAdapter;
    default:
      throw new Error(`지원하지 않는 PG_PROVIDER예요: ${selected}`);
  }
}

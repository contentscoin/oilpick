// Edge Function 에러 코드 상수. docs/spec/02-api.md에 등장하는 모든 에러 코드를 그대로 정의.
// 응답 포맷: 실패 시 `{ ok: false, code, message }` (02-api.md 공통 규칙).

/**
 * 진행중(REQUESTED~PICKED_UP) 주문이 3건 이상일 때 order-create가 반환. HTTP 409.
 * 02-api.md `order-create`.
 */
export const TOO_MANY_ACTIVE = "TOO_MANY_ACTIVE";

/**
 * 라이더가 verified·online·무진행주문 조건을 만족하지 못할 때 order-accept가 반환. HTTP 403.
 * 02-api.md `order-accept`.
 */
export const RIDER_NOT_ELIGIBLE = "RIDER_NOT_ELIGIBLE";

/**
 * 이미 다른 라이더가 선점한 REQUESTED 주문을 수락 시도할 때 order-accept가 반환. HTTP 409.
 * 02-api.md `order-accept`. 00-domain.md "매칭 규칙" 3.
 */
export const ALREADY_ACCEPTED = "ALREADY_ACCEPTED";

/**
 * orderMachine.canTransition이 거부하는 (from, action, role) 조합 요청 시 order-transition이 반환.
 * HTTP 409. 02-api.md `order-transition`.
 */
export const INVALID_TRANSITION = "INVALID_TRANSITION";

/**
 * DELIVER 액션에서 depot.qr_secret이 일치하지 않을 때 반환. HTTP 400.
 * 02-api.md `order-transition` DELIVER.
 */
export const INVALID_QR = "INVALID_QR";

/**
 * withdraw-request 시 프로필에 계좌 정보가 없을 때 반환. HTTP 400.
 * 02-api.md `withdraw-request`.
 */
export const NO_BANK_ACCOUNT = "NO_BANK_ACCOUNT";

/**
 * withdraw-request 시 v_point_balance.available이 요청 금액보다 작을 때 반환. HTTP 400.
 * 02-api.md `withdraw-request`.
 */
export const INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";

/**
 * 30분 무수락으로 order-expire cron이 자동 취소할 때의 cancel_reason 값
 * (에러 코드가 아니라 취소 사유 코드이지만 클라이언트/관리자 UI가 공유해야 하므로 함께 정의).
 * 00-domain.md "매칭 규칙" 2.
 */
export const NO_RIDER = "NO_RIDER";

/** zod 입력 검증 실패 시 공통 코드. HTTP 400. 02-api.md 공통 규칙. */
export const VALIDATION_ERROR = "VALIDATION_ERROR";

/** 인증 토큰 누락/무효. HTTP 401. 02-api.md 공통 규칙(Authorization 필수). */
export const UNAUTHORIZED = "UNAUTHORIZED";

/** 인증은 되었으나 role/소유권 등이 맞지 않는 경우의 공통 코드. HTTP 403. */
export const FORBIDDEN = "FORBIDDEN";

/** 대상 리소스(주문/출금 등)를 찾을 수 없는 경우의 공통 코드. HTTP 404. */
export const NOT_FOUND = "NOT_FOUND";

export const ERROR_CODES = {
  TOO_MANY_ACTIVE,
  RIDER_NOT_ELIGIBLE,
  ALREADY_ACCEPTED,
  INVALID_TRANSITION,
  INVALID_QR,
  NO_BANK_ACCOUNT,
  INSUFFICIENT_BALANCE,
  NO_RIDER,
  VALIDATION_ERROR,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 에러 코드 → 한글 사용자 메시지. 03-frontend.md "에러 표시" 절. */
export const ERROR_MESSAGE_KO: Record<ErrorCode, string> = {
  TOO_MANY_ACTIVE: "진행 중인 주문이 너무 많아요. 완료 후 다시 요청해주세요.",
  RIDER_NOT_ELIGIBLE: "지금은 콜을 수락할 수 없어요. 인증/온라인 상태를 확인해주세요.",
  ALREADY_ACCEPTED: "다른 라이더가 이미 수락했어요.",
  INVALID_TRANSITION: "지금은 처리할 수 없는 상태예요.",
  INVALID_QR: "QR 코드가 일치하지 않아요.",
  NO_BANK_ACCOUNT: "먼저 출금 계좌를 등록해주세요.",
  INSUFFICIENT_BALANCE: "출금 가능 잔액이 부족해요.",
  NO_RIDER: "수락한 라이더가 없어 자동 취소되었어요.",
  VALIDATION_ERROR: "입력값을 확인해주세요.",
  UNAUTHORIZED: "로그인이 필요해요.",
  FORBIDDEN: "권한이 없어요.",
  NOT_FOUND: "요청한 정보를 찾을 수 없어요.",
};

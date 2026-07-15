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
 * [08 P1 레거시] 전환기 잔존 쿠폰 주문(coupon_cost not null) 수락 시 fn_consume_coupon이 raise하는
 * 'INSUFFICIENT_COUPON' 예외의 매핑 코드. HTTP 409. 신규 주문은 쿠폰 게이트가 없어 발생하지 않는다.
 * order-accept mapTransitionError가 전환기 대비로 보존(02-api.md `order-accept`).
 */
export const INSUFFICIENT_COUPON = "INSUFFICIENT_COUPON";

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

/**
 * [09 H3] referral-attach 시 코드가 APPROVED 라이더의 추천코드와 매칭되지 않을 때(오코드·미승인·정지).
 * fn_attach_referral의 raise 'INVALID_REFERRAL_CODE' 매핑. HTTP 400. attach는 best-effort라 가입은 성립.
 */
export const INVALID_REFERRAL_CODE = "INVALID_REFERRAL_CODE";

/**
 * [09 H3] referral-attach 시 점주가 이미 다른 코드로 추천 연결됨(점주 1인 1회, 선착순 최초 확정).
 * RPC는 기존 행을 반환(멱등)하며, Edge가 요청 코드와 기존 코드 불일치를 감지해 이 코드로 알린다. HTTP 409.
 */
export const ALREADY_REFERRED = "ALREADY_REFERRED";

export const ERROR_CODES = {
  TOO_MANY_ACTIVE,
  RIDER_NOT_ELIGIBLE,
  ALREADY_ACCEPTED,
  INVALID_TRANSITION,
  INVALID_QR,
  NO_BANK_ACCOUNT,
  INSUFFICIENT_BALANCE,
  INSUFFICIENT_COUPON,
  NO_RIDER,
  VALIDATION_ERROR,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  INVALID_REFERRAL_CODE,
  ALREADY_REFERRED,
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
  INSUFFICIENT_COUPON: "이 주문은 이전 방식(수거쿠폰) 주문이라 지금은 수락할 수 없어요.",
  NO_RIDER: "수락한 라이더가 없어 자동 취소되었어요.",
  VALIDATION_ERROR: "입력값을 확인해주세요.",
  UNAUTHORIZED: "로그인이 필요해요.",
  FORBIDDEN: "권한이 없어요.",
  NOT_FOUND: "요청한 정보를 찾을 수 없어요.",
  INVALID_REFERRAL_CODE: "추천코드가 올바르지 않아요.",
  ALREADY_REFERRED: "이미 다른 추천으로 가입된 계정이에요.",
};

// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/constants.ts.
// packages/core/src/constants.ts
var KG_PER_CAN = 15;
var CAN_SIZE_L_DEFAULT = 18;
var PAYOUT_METHOD_LABEL = {
  CASH: "\uD604\uAE08",
  POINT: "\uD3EC\uC778\uD2B8"
};
var MIN_WITHDRAW = 1e4;
var BROADCAST_RADII = [3, 7, 15];
var MAX_RIDER_ACTIVE_ORDERS = 3;
var CALL_ACCEPT_TIMEOUT_SEC = 15;
var ORDER_STATUS_LABEL = {
  REQUESTED: "\uC218\uAC70 \uC694\uCCAD\uB428",
  ACCEPTED: "\uB77C\uC774\uB354 \uBC30\uC815",
  ARRIVED: "\uD604\uC7A5 \uB3C4\uCC29",
  PICKED_UP: "\uC218\uAC70 \uC644\uB8CC",
  // 레거시 전용
  DELIVERED: "\uBC30\uC1A1 \uC644\uB8CC",
  // 레거시 전용
  COMPLETED: "\uC644\uB8CC",
  CANCELLED: "\uCDE8\uC18C\uB428",
  DISPUTED: "\uD655\uC778 \uC911"
};
var CS_CATEGORY_LABEL = {
  ORDER: "\uC8FC\uBB38/\uC218\uAC70",
  CASH_DISPUTE: "\uC9C0\uAE09 \uBD84\uC7C1",
  COUPON_PAYMENT: "\uCFE0\uD3F0 \uACB0\uC81C/\uD658\uBD88(\uB808\uAC70\uC2DC)",
  ACCOUNT: "\uACC4\uC815",
  ETC: "\uAE30\uD0C0"
};
var CS_STATUS_LABEL = {
  OPEN: "\uC811\uC218",
  IN_PROGRESS: "\uCC98\uB9AC \uC911",
  RESOLVED: "\uC644\uB8CC"
};
var ARRIVED_STALE_MS = 24 * 60 * 60 * 1e3;
var REFERRAL_SUPPLIER_BONUS = 5e3;
var REFERRAL_RIDER_REWARD = 3e3;
var REFERRAL_CODE_STORAGE_KEY = "oilpick_referral_code";
var REFERRAL_LINK_BASE = "https://app.oilpick.kr";
var REFERRAL_STATUS_LABEL = {
  SIGNED_UP: "\uAC00\uC785",
  ACTIVATED: "\uD65C\uC131\uD654",
  CANCELLED: "\uCDE8\uC18C"
};
var NOTIFY_KIND = {
  /** [16 L5] cron 자동 확인 리마인드(supplier 대상, 제출 후 2h/12h) */
  CONFIRM_REMIND_AUTO: "CONFIRM_REMIND_AUTO",
  /** [16 L5] 라이더 수동 [확인 요청 다시 보내기](supplier 대상, 주문당 2h 1회) */
  CONFIRM_REMIND_MANUAL: "CONFIRM_REMIND_MANUAL",
  /** [16 L5] 확인 지연 에스컬레이션(admin 대상, 제출 후 24h) */
  CONFIRM_ESCALATION: "CONFIRM_ESCALATION",
  /** [16 L8] 좌상 크레딧 사용액 80% 밴드 진입(좌상+admin 대상) */
  CREDIT_BAND_80: "CREDIT_BAND_80",
  /** [16 L8] 좌상 미정산 사용액 임계(over_threshold) 진입(좌상+admin 대상) */
  CREDIT_OVER_THRESHOLD: "CREDIT_OVER_THRESHOLD",
  /** [16 L8] 좌상 정산 청구 생성(좌상 대상) */
  CLAIM_CREATED: "CLAIM_CREATED",
  /** [16 L8] 좌상 정산 청구 정산 완료(좌상 대상) */
  CLAIM_SETTLED: "CLAIM_SETTLED",
  /** [16 L8] 좌상 정산 청구 무효(좌상 대상) */
  CLAIM_VOIDED: "CLAIM_VOIDED",
  /** [16 L9] 추천 보상 오프라인 정산 완료 마킹 통지(라이더 대상, 09 H8) */
  PAYOUT_REFERRAL_SETTLED: "PAYOUT_REFERRAL_SETTLED"
};
export {
  ARRIVED_STALE_MS,
  BROADCAST_RADII,
  CALL_ACCEPT_TIMEOUT_SEC,
  CAN_SIZE_L_DEFAULT,
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  KG_PER_CAN,
  MAX_RIDER_ACTIVE_ORDERS,
  MIN_WITHDRAW,
  NOTIFY_KIND,
  ORDER_STATUS_LABEL,
  PAYOUT_METHOD_LABEL,
  REFERRAL_CODE_STORAGE_KEY,
  REFERRAL_LINK_BASE,
  REFERRAL_RIDER_REWARD,
  REFERRAL_STATUS_LABEL,
  REFERRAL_SUPPLIER_BONUS
};

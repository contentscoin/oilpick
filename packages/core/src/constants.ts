// 공유 상수. docs/spec/00-domain.md, 02-api.md, 03-frontend.md 기준.
// 이 파일의 값은 임의 변경 금지 — 스펙 변경 시 스펙 문서를 먼저 갱신할 것.

import type { OrderStatus } from "./orderMachine";
import type { CsCategory, CsStatus, PayoutMethod, ReferralStatus } from "./schemas";

/** 통 1개당 예상 kg (18L 통 기준). 00-domain.md "계량/수량 규칙". */
export const KG_PER_CAN = 15;

/**
 * KG_PER_CAN(15kg)이 기준으로 삼는 말통 용량(L). 00-domain.md "계량/수량 규칙"(18L 통 기준).
 * 통 크기 프리셋(18L 말통/10L/기타 — 08 P6)의 비례 환산 기준값. 이 상수와 KG_PER_CAN은 임의 변경 금지.
 */
export const CAN_SIZE_L_DEFAULT = 18;

/**
 * 현장 지급수단 한글 라벨(08 P2). 라이더 계량 제출 세그먼트/주문 카드·상세·admin 드로어 공용.
 */
export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  CASH: "현금",
  POINT: "포인트",
};

/** 최소 출금 포인트(P). 00-domain.md "포인트 원장 규칙". */
export const MIN_WITHDRAW = 10000;

/** 매칭 브로드캐스트 반경 단계(km). 00-domain.md "매칭 규칙" 1~2. */
export const BROADCAST_RADII = [3, 7, 15] as const;

/** 콜 수락 타임아웃(초). 03-frontend.md 상수 목록. */
export const CALL_ACCEPT_TIMEOUT_SEC = 15;

/**
 * 주문 상태 한글 라벨. 03-frontend.md "packages/core" 절 그대로.
 * 07 F9-⑦: PICKED_UP("수거 완료")·DELIVERED("배송 완료")는 레거시(구모델) 전용 라벨이다 —
 * 신규 주문은 도달하지 않으므로 신규 주문 화면(OrderTimeline 신경로 등)에 노출되지 않는다.
 * enum 값은 삭제 금지(07 §0)이며, 레거시 주문·admin 전체 상태 필터에서만 쓰인다.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  REQUESTED: "수거 요청됨",
  ACCEPTED: "라이더 배정",
  ARRIVED: "현장 도착",
  PICKED_UP: "수거 완료", // 레거시 전용
  DELIVERED: "배송 완료", // 레거시 전용
  COMPLETED: "완료",
  CANCELLED: "취소됨",
  DISPUTED: "확인 중",
};

/**
 * CS 문의 카테고리 한글 라벨(07 F12). CASH_DISPUTE = 지급(현금/포인트) 후 분쟁(상태머신 밖 수용처),
 * COUPON_PAYMENT = 레거시(쿠폰 모델 폐기, 08 P1) — DB enum 보존 원칙으로 값·라벨 유지, 신규 접수
 * 폼에서는 노출하지 않는다(과거 티켓 렌더용).
 */
export const CS_CATEGORY_LABEL: Record<CsCategory, string> = {
  ORDER: "주문/수거",
  CASH_DISPUTE: "지급 분쟁",
  COUPON_PAYMENT: "쿠폰 결제/환불(레거시)",
  ACCOUNT: "계정",
  ETC: "기타",
};

/** CS 문의 상태 한글 라벨(07 F12). */
export const CS_STATUS_LABEL: Record<CsStatus, string> = {
  OPEN: "접수",
  IN_PROGRESS: "처리 중",
  RESOLVED: "완료",
};

/** ARRIVED 24h 초과 체류 = 교착 조기 감지 임계(07 §1-3·F12-⑤, admin OrdersPage 하이라이트). */
export const ARRIVED_STALE_MS = 24 * 60 * 60 * 1000;

// ===== 라이더 추천(레퍼럴) — 09 H5/H3 =====

/**
 * 추천 활성화(피추천 점주 첫 수거 완료) 시 점주에게 적립되는 REFERRAL 포인트(P). 출금 가능(EARN과 동일 취급).
 * 가입 시점 스냅샷(referrals.supplier_bonus) — 이후 이 상수를 바꿔도 기존 추천엔 무영향. 임의 변경 금지.
 */
export const REFERRAL_SUPPLIER_BONUS = 5000;

/**
 * 추천 활성화 시 라이더 오프라인 정산 보상(원). 라이더 지갑 없음(08 P5) — 원장 적립이 아니라
 * referrals.rider_reward 스냅샷으로만 기록되어 admin 통계·오프라인 정산 청구 근거가 된다. 임의 변경 금지.
 */
export const REFERRAL_RIDER_REWARD = 3000;

/** user 앱 랜딩(/ref/:code)이 코드를 저장하는 localStorage 키. 가입 성공 직후 attach가 읽어 소비한다. */
export const REFERRAL_CODE_STORAGE_KEY = "oilpick_referral_code";

/**
 * 라이더 공유 링크 베이스(웹 랜딩)의 기본값. 실제 링크 조립은 Edge(referral-code)가 담당한다 —
 * `REFERRAL_BASE_URL`(Supabase 시크릿) 우선, 미설정 시 이 상수로 `${base}/ref/<CODE>`를 만들어 shareUrl로
 * 반환하고, 앱은 서버가 준 shareUrl을 그대로 표시한다(앱에서 별도 env로 조립하지 않음).
 */
export const REFERRAL_LINK_BASE = "https://app.oilpick.kr";

/** 추천 상태 한글 라벨(09 H2). 라이더 실적·admin 퍼널 공용. */
export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  SIGNED_UP: "가입",
  ACTIVATED: "활성화",
  CANCELLED: "취소",
};

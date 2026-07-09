// 공유 상수. docs/spec/00-domain.md, 02-api.md, 03-frontend.md 기준.
// 이 파일의 값은 임의 변경 금지 — 스펙 변경 시 스펙 문서를 먼저 갱신할 것.

import type { OrderStatus } from "./orderMachine";
import type { CsCategory, CsStatus } from "./schemas";

/** 통 1개당 예상 kg (18L 통 기준). 00-domain.md "계량/수량 규칙". */
export const KG_PER_CAN = 15;

/**
 * KG_PER_CAN(15kg)이 기준으로 삼는 말통 용량(L). 00-domain.md "계량/수량 규칙"(18L 통 기준).
 * 07 F9-③ 통 크기 프리셋(18L 말통/10L/기타)의 비례 환산 기준값. 이 상수와 KG_PER_CAN은
 * 임의 변경 금지 — coupon_cost는 서버가 requestedKg 기준으로 산정하므로 kg 환산만 정확하면 된다(07 §1-2).
 */
export const CAN_SIZE_L_DEFAULT = 18;

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
 * CS 문의 카테고리 한글 라벨(07 F12). CASH_DISPUTE = 현금 지급 후 분쟁(상태머신 밖 수용처, 07 §1-3),
 * COUPON_PAYMENT = 쿠폰 결제/환불 문의(→ admin SettlementPage 환불 연결).
 */
export const CS_CATEGORY_LABEL: Record<CsCategory, string> = {
  ORDER: "주문/수거",
  CASH_DISPUTE: "현금 지급 분쟁",
  COUPON_PAYMENT: "쿠폰 결제/환불",
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

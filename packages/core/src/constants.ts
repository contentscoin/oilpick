// 공유 상수. docs/spec/00-domain.md, 02-api.md, 03-frontend.md 기준.
// 이 파일의 값은 임의 변경 금지 — 스펙 변경 시 스펙 문서를 먼저 갱신할 것.

import type { OrderStatus } from "./orderMachine";

/** 통 1개당 예상 kg (18L 통 기준). 00-domain.md "계량/수량 규칙". */
export const KG_PER_CAN = 15;

/** 최소 출금 포인트(P). 00-domain.md "포인트 원장 규칙". */
export const MIN_WITHDRAW = 10000;

/** 매칭 브로드캐스트 반경 단계(km). 00-domain.md "매칭 규칙" 1~2. */
export const BROADCAST_RADII = [3, 7, 15] as const;

/** 콜 수락 타임아웃(초). 03-frontend.md 상수 목록. */
export const CALL_ACCEPT_TIMEOUT_SEC = 15;

/** 주문 상태 한글 라벨. 03-frontend.md "packages/core" 절 그대로. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  REQUESTED: "수거 요청됨",
  ACCEPTED: "라이더 배정",
  ARRIVED: "현장 도착",
  PICKED_UP: "수거 완료",
  DELIVERED: "배송 완료",
  COMPLETED: "완료",
  CANCELLED: "취소됨",
  DISPUTED: "확인 중",
};

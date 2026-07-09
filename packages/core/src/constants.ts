// 공유 상수. docs/spec/00-domain.md, 02-api.md, 03-frontend.md 기준.
// 이 파일의 값은 임의 변경 금지 — 스펙 변경 시 스펙 문서를 먼저 갱신할 것.

import type { OrderStatus } from "./orderMachine";

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

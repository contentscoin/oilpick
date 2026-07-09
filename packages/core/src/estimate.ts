// 예상 kg / 예상 현금 수령액 계산. 00-domain.md "계량/수량 규칙".
// "확정 현금 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림"(cash_paid_amount)은 서버
// (fn_transition_order의 CONFIRM_MEASURE/FORCE_COMPLETE)가 기록하며, 이 파일은 UI 표시용
// "예상" 값만 다룬다.

import { CAN_SIZE_L_DEFAULT, KG_PER_CAN } from "./constants";

/**
 * 통 수 → 예상 kg. 07 F9-③ 통 크기 프리셋 지원.
 * - 기본(18L 말통): `cans × KG_PER_CAN`(15kg) — 현행 동작 유지(단일 인자 호출 하위 호환).
 * - 10L 등 다른 용량: 18L 대비 비례 환산 `cans × 15 × (canSizeL / 18)` 후 소수 1자리 반올림
 *   (numeric(8,1) 규칙, 01-db-schema.sql).
 * "기타"(kg 직접 입력)는 이 함수를 거치지 않고 kg을 그대로 쓴다.
 *
 * ⚠️ coupon_cost는 서버(order-create)가 requestedKg 기준으로 산정한다(07 §1-2, D2).
 * 통 크기 프리셋은 이 공식(ceil(kg/15))에 영향이 없다 — 클라이언트는 kg만 정확히 보내면 된다.
 */
export function estimateKg(cans: number, canSizeL: number = CAN_SIZE_L_DEFAULT): number {
  const perCanKg = KG_PER_CAN * (canSizeL / CAN_SIZE_L_DEFAULT);
  return Math.round(cans * perCanKg * 10) / 10;
}

/**
 * 예상 kg × 시세(원/kg) → 예상 현금 수령액(UI 표시용, 원 단위 반올림).
 * 신모델(07 §1-2, D1)에서 점주는 현장 현금을 수령한다.
 * "현장 계량 기준으로 확정됩니다" 고지와 함께 노출한다(00-domain.md).
 */
export function estimateCash(kg: number, pricePerKg: number): number {
  return Math.round(kg * pricePerKg);
}

// [07 F13] estimatePoint(deprecated 별칭) 제거 — 구모델 소비처(HomePage/RequestPage 등)는
// F8·F9에서 estimateCash 원화 카피로 전환 완료, 잔존 참조 0.

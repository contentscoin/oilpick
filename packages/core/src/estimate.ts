// 예상 kg / 예상 현금 수령액 계산. 00-domain.md "계량/수량 규칙".
// "확정 현금 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림"(cash_paid_amount)은 서버
// (fn_transition_order의 CONFIRM_MEASURE/FORCE_COMPLETE)가 기록하며, 이 파일은 UI 표시용
// "예상" 값만 다룬다.

import { KG_PER_CAN } from "./constants";

/** 통 수 → 예상 kg. 예상 kg = 통 수 × 15kg(KG_PER_CAN). */
export function estimateKg(cans: number): number {
  return cans * KG_PER_CAN;
}

/**
 * 예상 kg × 시세(원/kg) → 예상 현금 수령액(UI 표시용, 원 단위 반올림).
 * 신모델(07 §1-2, D1)에서 점주는 현장 현금을 수령한다.
 * "현장 계량 기준으로 확정됩니다" 고지와 함께 노출한다(00-domain.md).
 */
export function estimateCash(kg: number, pricePerKg: number): number {
  return Math.round(kg * pricePerKg);
}

/**
 * @deprecated 07 D1로 포인트 적립 모델이 폐기됐다. `estimateCash`를 사용하라.
 * 구모델 소비처(HomePage/RequestPage 등, F8·F9에서 원화 카피로 전환) 호환을 위한 별칭이며
 * 계산식은 estimateCash와 동일하다(kg × 시세, 정수 반올림). F13 레거시 일몰에서 제거한다.
 */
export const estimatePoint = estimateCash;

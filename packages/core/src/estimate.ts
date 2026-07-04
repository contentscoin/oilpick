// 예상 kg / 예상 포인트 계산. 00-domain.md "계량/수량 규칙".
// "확정 포인트 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림"은 서버(Edge Function/RPC)의
// fn_post_ledger 계산 로직이며 이 파일은 UI 표시용 "예상" 값만 다룬다.

import { KG_PER_CAN } from "./constants";

/** 통 수 → 예상 kg. 예상 kg = 통 수 × 15kg(KG_PER_CAN). */
export function estimateKg(cans: number): number {
  return cans * KG_PER_CAN;
}

/**
 * 예상 kg × 시세(원/kg) → 예상 포인트(UI 표시용, 정수 반올림).
 * "현장 계량 기준으로 확정됩니다" 고지와 함께 노출한다(00-domain.md).
 */
export function estimatePoint(kg: number, pricePerKg: number): number {
  return Math.round(kg * pricePerKg);
}

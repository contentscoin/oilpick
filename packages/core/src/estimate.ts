// 예상 kg / 예상 수령액 계산. 00-domain.md "계량/수량 규칙".
// "확정 지급액 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림"(cash_paid_amount — 현금/포인트
// 공통, 08 P3)은 서버(fn_transition_order의 CONFIRM_MEASURE/FORCE_COMPLETE)가 기록하며,
// 이 파일은 UI 표시용 "예상" 값만 다룬다.

import { CAN_SIZE_L_DEFAULT, KG_PER_CAN } from "./constants";

/**
 * 통 수 → 예상 kg. 통 크기 프리셋(18L 말통/10L/기타 — 08 P6) 지원.
 * - 기본(18L 말통): `cans × KG_PER_CAN`(15kg) — 단일 인자 호출 하위 호환.
 * - 10L 등 다른 용량: 18L 대비 비례 환산 `cans × 15 × (canSizeL / 18)` 후 소수 1자리 반올림
 *   (numeric(8,1) 규칙, 01-db-schema.sql).
 * "기타"(kg 직접 입력)는 이 함수를 거치지 않고 kg을 그대로 쓴다.
 */
export function estimateKg(cans: number, canSizeL: number = CAN_SIZE_L_DEFAULT): number {
  const perCanKg = KG_PER_CAN * (canSizeL / CAN_SIZE_L_DEFAULT);
  return Math.round(cans * perCanKg * 10) / 10;
}

/**
 * 예상 kg × 시세(원/kg) → 예상 수령액(UI 표시용, 원 단위 반올림).
 * 08 신모델에서 지급수단(현금/포인트)은 현장에서 라이더가 선택하므로 카피는 수단 중립
 * "예상 수령액"을 쓴다. "현장 계량 기준으로 확정됩니다" 고지와 함께 노출한다(00-domain.md).
 */
export function estimateCash(kg: number, pricePerKg: number): number {
  return Math.round(kg * pricePerKg);
}

/**
 * [14 §5] 신유 대금(원) = 배달 통수 × 통당가. 정수곱(반올림 없음 — 서버 fn_settle_trade와 동일 계약).
 * cans는 정수 통수, pricePerCan은 18L 1통 고시가(원).
 */
export function estimatePurchase(cans: number, pricePerCan: number): number {
  return Math.round(cans) * pricePerCan;
}

/**
 * [14 §5] 현장 상계 순액(원) = 폐유 총액 − 신유 대금. 양수=점주 수령, 0=정확 상계, 음수=점주 지불.
 * UI 미리보기용 — 확정은 현장 계량 후 서버(fn_settle_trade)가 기록한다.
 */
export function estimateNet(
  kg: number,
  pricePerKg: number,
  cans: number,
  pricePerCan: number,
): number {
  return estimateCash(kg, pricePerKg) - estimatePurchase(cans, pricePerCan);
}

// [07 F13] estimatePoint(deprecated 별칭) 제거 — 구모델 소비처(HomePage/RequestPage 등)는
// F8·F9에서 estimateCash 원화 카피로 전환 완료, 잔존 참조 0.

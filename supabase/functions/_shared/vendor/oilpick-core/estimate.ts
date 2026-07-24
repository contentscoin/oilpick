// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/estimate.ts.
// packages/core/src/constants.ts
var KG_PER_CAN = 15;
var CAN_SIZE_L_DEFAULT = 18;
var ARRIVED_STALE_MS = 24 * 60 * 60 * 1e3;

// packages/core/src/estimate.ts
function estimateKg(cans, canSizeL = CAN_SIZE_L_DEFAULT) {
  const perCanKg = KG_PER_CAN * (canSizeL / CAN_SIZE_L_DEFAULT);
  return Math.round(cans * perCanKg * 10) / 10;
}
function estimateCash(kg, pricePerKg) {
  return Math.round(kg * pricePerKg);
}
function estimatePurchase(cans, pricePerCan) {
  return Math.round(cans) * pricePerCan;
}
function estimateNet(kg, pricePerKg, cans, pricePerCan) {
  return estimateCash(kg, pricePerKg) - estimatePurchase(cans, pricePerCan);
}
export {
  estimateCash,
  estimateKg,
  estimateNet,
  estimatePurchase
};

// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/estimate.ts.
// packages/core/src/constants.ts
var KG_PER_CAN = 15;

// packages/core/src/estimate.ts
function estimateKg(cans) {
  return cans * KG_PER_CAN;
}
function estimatePoint(kg, pricePerKg) {
  return Math.round(kg * pricePerKg);
}
export {
  estimateKg,
  estimatePoint
};

// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/orderMachine.ts.
// ../../../../packages/core/src/orderMachine.ts
var ORDER_NONE = "NONE";
var TRANSITIONS = [
  {
    from: ORDER_NONE,
    action: "CREATE",
    role: "supplier",
    to: "REQUESTED",
    guard: "\uC9C4\uD589\uC911 \uC8FC\uBB38(REQUESTED~PICKED_UP) 3\uAC74 \uBBF8\uB9CC. coupon_cost \uC2A4\uB0C5\uC0F7"
  },
  {
    from: "REQUESTED",
    action: "ACCEPT",
    role: "rider",
    to: "ACCEPTED",
    guard: "rider verified & online & \uC9C4\uD589\uC911 \uC8FC\uBB38 \uC5C6\uC74C + \uCFE0\uD3F0 \uC794\uC561 \u2265 coupon_cost. \uC120\uCC29\uC21C 1\uBA85(\uC870\uAC74\uBD80 update \uB77D). \uCFE0\uD3F0 CONSUME"
  },
  {
    from: "ACCEPTED",
    action: "ARRIVE",
    role: "rider",
    to: "ARRIVED",
    guard: "\uBC30\uC815 rider \uBCF8\uC778"
  },
  {
    from: "ARRIVED",
    action: "SUBMIT_MEASURE",
    role: "rider",
    to: "ARRIVED",
    guard: "\uBC30\uC815 rider \uBCF8\uC778. measuredKg + photoUrls(>=1) \uD544\uC218. \uC0C1\uD0DC\uB294 ARRIVED \uC720\uC9C0. \uC911\uC7AC \uC644\uB8CC(final_kg) \uC8FC\uBB38\uC740 \uC7AC\uC81C\uCD9C \uBD88\uAC00"
  },
  {
    from: "ARRIVED",
    action: "CONFIRM_MEASURE",
    role: "supplier",
    to: "COMPLETED",
    guard: "\uC8FC\uBB38 \uBCF8\uC778 supplier. \uBB34\uAC8C+\uD604\uAE08 \uC218\uB839 2\uC790 \uD655\uC778. cash_paid_amount+completed_at \uAE30\uB85D. EARN/HOLD \uC5C6\uC74C"
  },
  {
    from: "ARRIVED",
    action: "DISPUTE",
    role: "supplier",
    to: "DISPUTED",
    guard: "\uC8FC\uBB38 \uBCF8\uC778 supplier. reason \uD544\uC218(\uD604\uAE08 \uC9C0\uAE09 \uC804 \uACC4\uB7C9 \uC774\uC758)"
  },
  {
    from: "DISPUTED",
    action: "RESOLVE_DISPUTE",
    role: "admin",
    to: "ARRIVED",
    guard: "admin \uC911\uC7AC. finalKg \uACE0\uC815 \uD6C4 ARRIVED \uBCF5\uADC0(\uC774\uD6C4 CONFIRM_MEASURE\uB85C \uC644\uB8CC). \uC989\uC2DC \uC9C0\uAE09 \uC544\uB2D8"
  },
  {
    from: "ARRIVED",
    action: "FORCE_COMPLETE",
    role: "admin",
    to: "COMPLETED",
    guard: "admin(D6). \uACC4\uB7C9/\uC911\uC7AC kg \uC874\uC7AC + memo \uD544\uC218. \uC810\uC8FC \uC218\uB839 \uD655\uC778 \uAD50\uCC29 \uD574\uC18C"
  },
  {
    from: "REQUESTED",
    action: "CANCEL",
    role: "supplier",
    to: "CANCELLED",
    guard: "\uC218\uB77D \uC804(REQUESTED) \uC5B8\uC81C\uB098 \uCDE8\uC18C \uAC00\uB2A5. \uCFE0\uD3F0 \uBBF8\uC18C\uC9C4"
  },
  {
    from: "ACCEPTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin\uB9CC + fault \uD544\uC218(D4\xB7D6). SUPPLIER/SYSTEM\u2192REFUND, RIDER\u2192\uD658\uAE09 \uC5C6\uC74C"
  },
  {
    from: "ARRIVED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin\uB9CC + fault \uD544\uC218(D4\xB7D6). SUPPLIER/SYSTEM\u2192REFUND, RIDER\u2192\uD658\uAE09 \uC5C6\uC74C"
  },
  {
    from: "DISPUTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin\uB9CC + fault \uD544\uC218(D4\xB7D6). SUPPLIER/SYSTEM\u2192REFUND, RIDER\u2192\uD658\uAE09 \uC5C6\uC74C"
  }
];
var LEGACY_TRANSITIONS = [
  {
    from: "PICKED_UP",
    action: "DELIVER",
    role: "rider",
    to: "COMPLETED",
    guard: "\uB808\uAC70\uC2DC. \uBC30\uC815 rider. depot.qr_secret \uC77C\uCE58. RELEASE \uD6C4 DELIVERED \uACBD\uC720 \uC989\uC2DC COMPLETED"
  }
];
function canTransition(from, action, role) {
  return TRANSITIONS.some(
    (rule) => rule.from === from && rule.action === action && rule.role === role
  );
}
function canLegacyTransition(from, action, role) {
  return LEGACY_TRANSITIONS.some(
    (rule) => rule.from === from && rule.action === action && rule.role === role
  );
}
function getTransitionTarget(from, action, role) {
  return TRANSITIONS.find(
    (rule) => rule.from === from && rule.action === action && rule.role === role
  )?.to;
}
function getAvailableActions(from, role) {
  return TRANSITIONS.filter((rule) => rule.from === from && rule.role === role).map(
    (rule) => rule.action
  );
}
function getLegacyAvailableActions(from, role) {
  return LEGACY_TRANSITIONS.filter((rule) => rule.from === from && rule.role === role).map(
    (rule) => rule.action
  );
}
export {
  LEGACY_TRANSITIONS,
  ORDER_NONE,
  TRANSITIONS,
  canLegacyTransition,
  canTransition,
  getAvailableActions,
  getLegacyAvailableActions,
  getTransitionTarget
};

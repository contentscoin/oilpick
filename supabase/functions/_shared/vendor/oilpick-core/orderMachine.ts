// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/orderMachine.ts.
// packages/core/src/orderMachine.ts
var ORDER_NONE = "NONE";
var TRANSITIONS = [
  {
    from: ORDER_NONE,
    action: "CREATE",
    role: "supplier",
    to: "REQUESTED",
    guard: "\uC9C4\uD589\uC911 \uC8FC\uBB38(REQUESTED~PICKED_UP) 3\uAC74 \uBBF8\uB9CC"
  },
  {
    from: "REQUESTED",
    action: "ACCEPT",
    role: "rider",
    to: "ACCEPTED",
    guard: "rider verified & online & \uC9C4\uD589\uC911 \uC8FC\uBB38 \uC5C6\uC74C. \uC120\uCC29\uC21C 1\uBA85(\uC870\uAC74\uBD80 update \uB77D)"
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
    guard: "\uBC30\uC815 rider \uBCF8\uC778. measuredKg + photoUrls(>=1) \uD544\uC218. \uC0C1\uD0DC\uB294 ARRIVED \uC720\uC9C0"
  },
  {
    from: "ARRIVED",
    action: "CONFIRM_MEASURE",
    role: "supplier",
    to: "PICKED_UP",
    guard: "\uC8FC\uBB38 \uBCF8\uC778 supplier. final_kg=measured_kg. EARN+HOLD \uC9C0\uAE09"
  },
  {
    from: "ARRIVED",
    action: "DISPUTE",
    role: "supplier",
    to: "DISPUTED",
    guard: "\uC8FC\uBB38 \uBCF8\uC778 supplier. reason \uD544\uC218"
  },
  {
    from: "DISPUTED",
    action: "RESOLVE_DISPUTE",
    role: "admin",
    to: "PICKED_UP",
    guard: "admin \uC911\uC7AC. finalKg\uB85C EARN+HOLD \uC9C0\uAE09(CONFIRM_MEASURE\uC640 \uB3D9\uC77C \uC9C0\uAE09 \uB85C\uC9C1)"
  },
  {
    from: "PICKED_UP",
    action: "DELIVER",
    role: "rider",
    to: "COMPLETED",
    guard: "\uBC30\uC815 rider. depot.qr_secret \uC77C\uCE58 \uAC80\uC99D. RELEASE(rider) \uD6C4 DELIVERED \uACBD\uC720 \uC989\uC2DC COMPLETED"
  },
  {
    from: "REQUESTED",
    action: "CANCEL",
    role: "supplier",
    to: "CANCELLED",
    guard: "\uC218\uB77D \uC804(REQUESTED) \uC5B8\uC81C\uB098 \uCDE8\uC18C \uAC00\uB2A5"
  },
  {
    from: "ACCEPTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin\uB9CC. \uB77C\uC774\uB354 \uB178\uC1FC \uB4F1. REQUESTED \uC7AC\uC0DD\uC131\uC740 admin \uC218\uB3D9"
  }
];
function canTransition(from, action, role) {
  return TRANSITIONS.some(
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
export {
  ORDER_NONE,
  TRANSITIONS,
  canTransition,
  getAvailableActions,
  getTransitionTarget
};

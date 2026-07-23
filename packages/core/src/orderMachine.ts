// 주문 상태머신 — 단일 진실(single source of truth).
// docs/spec/00-domain.md "주문 상태머신" 표 + docs/spec/02-api.md의 action 이름을
// 그대로 코드로 옮긴 것. Edge Function(order-create/order-accept/order-transition)과
// 클라이언트 UI(버튼 노출)가 반드시 이 파일의 canTransition/TRANSITIONS만 참조한다.
//
// [08 피벗] 상태 경로는 07과 동일(REQUESTED→ACCEPTED→ARRIVED→COMPLETED). 부수효과 개정:
// ACCEPT의 쿠폰 게이트 소멸(신규 주문 coupon_cost null — 08 P1), SUBMIT_MEASURE에 지급수단
// (payoutMethod: CASH|POINT) 필수(08 P2), CONFIRM_MEASURE/FORCE_COMPLETE는 POINT면 supplier
// EARN 발행(08 P3). 구모델의 PICKED_UP/DELIVERED 경로는 LEGACY_TRANSITIONS로 분리 보존.
//
// 표에 없는 (from, action, role) 조합은 전부 거부되어야 한다 (전수 테스트 대상).

/** DB enum order_status. docs/spec/01-db-schema.sql 참고. PICKED_UP/DELIVERED는 레거시 잔존 상태(enum 삭제 금지). */
export type OrderStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "ARRIVED"
  | "PICKED_UP"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

/** 아직 주문이 존재하지 않는 상태(생성 이전)를 나타내는 가상의 from. */
export const ORDER_NONE = "NONE" as const;
export type OrderStatusOrNone = OrderStatus | typeof ORDER_NONE;

/** DB enum user_role. docs/spec/01-db-schema.sql 참고. dealer=좌상(서브어드민, 13). */
export type UserRole = "supplier" | "rider" | "admin" | "dealer";

/**
 * order-create와 order-accept/order-transition에서 쓰이는 전이 액션.
 * 02-api.md의 action 필드 값과 1:1 대응. CREATE/ACCEPT는 각각
 * order-create / order-accept 엔드포인트에 대응하는 논리적 액션이며,
 * 나머지는 order-transition의 action 값 그대로다.
 * FORCE_COMPLETE는 07 D6 admin 교착 해소 액션. DELIVER는 레거시(LEGACY_TRANSITIONS 참조).
 */
export type OrderAction =
  | "CREATE"
  | "ACCEPT"
  | "ARRIVE"
  | "SUBMIT_MEASURE"
  | "CONFIRM_MEASURE"
  | "DISPUTE"
  | "RESOLVE_DISPUTE"
  | "FORCE_COMPLETE"
  | "DELIVER"
  | "CANCEL";

/** 하나의 전이 규칙. guard는 사람이 읽는 설명이며 실제 가드 로직은 Edge Function/RPC가 수행한다. */
export interface OrderTransitionRule {
  from: OrderStatusOrNone;
  action: OrderAction;
  role: UserRole;
  to: OrderStatus;
  /** 00-domain.md 표의 "가드 조건" 설명 (문서화용, canTransition 판정에는 role/from/action만 사용). */
  guard: string;
}

/**
 * 신 전이 테이블. docs/spec/00-domain.md "주문 상태머신" 표(07 피벗 반영) + 02-api.md action 매핑.
 *
 * 매핑 근거(00-domain.md 표 행 순서대로):
 * 1. (생성)→REQUESTED, supplier                → { NONE, CREATE, supplier }
 * 2. REQUESTED→ACCEPTED, rider                  → { REQUESTED, ACCEPT, rider }  (가드: 쿠폰 잔액 ≥ coupon_cost)
 * 3. ACCEPTED→ARRIVED, rider(배정 본인)         → { ACCEPTED, ARRIVE, rider }
 * 4. ARRIVED(SUBMIT_MEASURE), rider(배정 본인)  → { ARRIVED, SUBMIT_MEASURE, rider, to: ARRIVED }(상태 유지)
 * 5. ARRIVED→COMPLETED, supplier(CONFIRM_MEASURE, 2자 확인) → { ARRIVED, CONFIRM_MEASURE, supplier, to: COMPLETED }
 * 6. ARRIVED→DISPUTED, supplier                 → { ARRIVED, DISPUTE, supplier }
 * 7. DISPUTED→ARRIVED, admin(RESOLVE_DISPUTE, kg 확정까지만) → { DISPUTED, RESOLVE_DISPUTE, admin, to: ARRIVED }
 * 8. ARRIVED→COMPLETED, admin(FORCE_COMPLETE, D6) → { ARRIVED, FORCE_COMPLETE, admin, to: COMPLETED }
 * 9. REQUESTED→CANCELLED, supplier 자진          → { REQUESTED, CANCEL, supplier }
 * 10~12. {ACCEPTED|ARRIVED|DISPUTED}→CANCELLED, admin(+fault) → { ..., CANCEL, admin }
 *
 * REQUESTED→CANCELLED(시스템/30분 무수락)는 order-expire cron이 service_role로 직접 처리하는
 * 자동화이며 actor가 "시스템"이라 역할 기반 canTransition 대상이 아니다.
 */
export const TRANSITIONS: readonly OrderTransitionRule[] = [
  {
    from: ORDER_NONE,
    action: "CREATE",
    role: "supplier",
    to: "REQUESTED",
    guard: "진행중 주문(REQUESTED~PICKED_UP) 3건 미만. 시세 스냅샷(coupon_cost 스냅샷 중지 — 08 P1)",
  },
  {
    from: "REQUESTED",
    action: "ACCEPT",
    role: "rider",
    to: "ACCEPTED",
    guard: "rider verified(APPROVED) & online & 진행중 주문 없음. 선착순 1명(조건부 update 락). 쿠폰 게이트 소멸(08 P1)",
  },
  {
    from: "ACCEPTED",
    action: "ARRIVE",
    role: "rider",
    to: "ARRIVED",
    guard: "배정 rider 본인",
  },
  {
    from: "ARRIVED",
    action: "SUBMIT_MEASURE",
    role: "rider",
    to: "ARRIVED",
    guard: "배정 rider 본인. measuredKg + photoUrls(>=1) + payoutMethod(CASH|POINT — 08 P2) 필수. 상태는 ARRIVED 유지. 중재 완료(final_kg) 주문은 재제출 불가",
  },
  {
    from: "ARRIVED",
    action: "CONFIRM_MEASURE",
    role: "supplier",
    to: "COMPLETED",
    guard: "주문 본인 supplier. 무게+지급 2자 확인. cash_paid_amount+completed_at 기록. POINT면 supplier EARN 발행(08 P3)",
  },
  {
    from: "ARRIVED",
    action: "DISPUTE",
    role: "supplier",
    to: "DISPUTED",
    guard: "주문 본인 supplier. reason 필수(현금 지급 전 계량 이의)",
  },
  {
    from: "DISPUTED",
    action: "RESOLVE_DISPUTE",
    role: "admin",
    to: "ARRIVED",
    guard: "admin 중재. finalKg 고정 후 ARRIVED 복귀(이후 CONFIRM_MEASURE로 완료). 즉시 지급 아님",
  },
  {
    from: "ARRIVED",
    action: "FORCE_COMPLETE",
    role: "admin",
    to: "COMPLETED",
    guard: "admin(07 D6). 계량/중재 kg 존재 + memo 필수. 점주 수령 확인 교착 해소. POINT면 EARN 발행(08 P3)",
  },
  {
    from: "REQUESTED",
    action: "CANCEL",
    role: "supplier",
    to: "CANCELLED",
    guard: "수락 전(REQUESTED) 언제나 취소 가능. 쿠폰 미소진",
  },
  {
    from: "ACCEPTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin만 + fault 필수(07 D4·D6 — 감사 기록). 쿠폰 REFUND는 레거시 잔존 주문에서만(08 P1)",
  },
  {
    from: "ARRIVED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin만 + fault 필수(07 D4·D6 — 감사 기록). 쿠폰 REFUND는 레거시 잔존 주문에서만(08 P1)",
  },
  {
    from: "DISPUTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin만 + fault 필수(07 D4·D6 — 감사 기록). 쿠폰 REFUND는 레거시 잔존 주문에서만(08 P1)",
  },
] as const;

/**
 * 레거시 전이(구모델 PICKED_UP/DELIVERED 경로). 신규 주문은 절대 도달하지 않으며
 * (coupon_cost null 또는 이미 PICKED_UP인) 프로덕션 잔존 주문 완결용으로만 유효하다.
 * 00-domain.md "레거시 주문 전용 전이" 표 참조. enum 값(PICKED_UP/DELIVERED)은 삭제 금지.
 *
 * 신 CONFIRM_MEASURE(→COMPLETED)/RESOLVE_DISPUTE(→ARRIVED)가 구모델의 →PICKED_UP 전이를
 * 대체하므로, 잔존 주문 중 실제로 구 경로가 필요한 것은 이미 PICKED_UP에 도달한 주문의
 * DELIVER(집하장 QR)뿐이다. fn_transition_order의 DELIVER 분기가 이를 처리한다.
 */
export const LEGACY_TRANSITIONS: readonly OrderTransitionRule[] = [
  {
    from: "PICKED_UP",
    action: "DELIVER",
    role: "rider",
    to: "COMPLETED",
    guard: "레거시. 배정 rider. depot.qr_secret 일치. 지급 없음(07 D1 보강) — DELIVERED 경유 즉시 COMPLETED",
  },
] as const;

/**
 * (from, action, role) 조합이 유효한 신 전이인지 판정하는 순수 함수.
 * 표(TRANSITIONS)에 없는 조합은 반드시 false를 반환한다. 레거시 전이는 canLegacyTransition 사용.
 */
export function canTransition(
  from: OrderStatusOrNone,
  action: OrderAction,
  role: UserRole,
): boolean {
  return TRANSITIONS.some(
    (rule) => rule.from === from && rule.action === action && rule.role === role,
  );
}

/** 레거시 전이(PICKED_UP/DELIVERED 경로) 판정. 신 전이와 분리 유지(07 §1-3). */
export function canLegacyTransition(
  from: OrderStatusOrNone,
  action: OrderAction,
  role: UserRole,
): boolean {
  return LEGACY_TRANSITIONS.some(
    (rule) => rule.from === from && rule.action === action && rule.role === role,
  );
}

/** 유효한 신 전이일 때의 목적지 상태를 반환. 유효하지 않으면 undefined. */
export function getTransitionTarget(
  from: OrderStatusOrNone,
  action: OrderAction,
  role: UserRole,
): OrderStatus | undefined {
  return TRANSITIONS.find(
    (rule) => rule.from === from && rule.action === action && rule.role === role,
  )?.to;
}

/** 특정 role이 특정 from 상태에서 실행 가능한 신 액션 목록 (UI 버튼 노출용). */
export function getAvailableActions(
  from: OrderStatusOrNone,
  role: UserRole,
): OrderAction[] {
  return TRANSITIONS.filter((rule) => rule.from === from && rule.role === role).map(
    (rule) => rule.action,
  );
}

/** 레거시 주문에서 role이 실행 가능한 레거시 액션 목록(잔존 PICKED_UP 주문 UI 조건부 렌더용). */
export function getLegacyAvailableActions(
  from: OrderStatusOrNone,
  role: UserRole,
): OrderAction[] {
  return LEGACY_TRANSITIONS.filter((rule) => rule.from === from && rule.role === role).map(
    (rule) => rule.action,
  );
}

// 주문 상태머신 — 단일 진실(single source of truth).
// docs/spec/00-domain.md "주문 상태머신" 표 + docs/spec/02-api.md의 action 이름을
// 그대로 코드로 옮긴 것. Edge Function(order-create/order-accept/order-transition)과
// 클라이언트 UI(버튼 노출)가 반드시 이 파일의 canTransition/TRANSITIONS만 참조한다.
//
// 표에 없는 (from, action, role) 조합은 전부 거부되어야 한다 (전수 테스트 대상).

/** DB enum order_status. docs/spec/01-db-schema.sql 참고. */
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

/** DB enum user_role. docs/spec/01-db-schema.sql 참고. */
export type UserRole = "supplier" | "rider" | "admin";

/**
 * order-create와 order-accept/order-transition에서 쓰이는 전이 액션.
 * 02-api.md의 action 필드 값과 1:1 대응. CREATE/ACCEPT는 각각
 * order-create / order-accept 엔드포인트에 대응하는 논리적 액션이며,
 * 나머지는 order-transition의 action 값 그대로다.
 */
export type OrderAction =
  | "CREATE"
  | "ACCEPT"
  | "ARRIVE"
  | "SUBMIT_MEASURE"
  | "CONFIRM_MEASURE"
  | "DISPUTE"
  | "RESOLVE_DISPUTE"
  | "DELIVER"
  | "CANCEL";

/** 하나의 전이 규칙. guard는 사람이 읽는 설명이며 실제 가드 로직은 Edge Function이 수행한다. */
export interface OrderTransitionRule {
  from: OrderStatusOrNone;
  action: OrderAction;
  role: UserRole;
  to: OrderStatus;
  /** 00-domain.md 표의 "가드 조건" 설명 (문서화용, canTransition 판정에는 role/from/action만 사용). */
  guard: string;
}

/**
 * 전이 테이블. docs/spec/00-domain.md "주문 상태머신" 표의 모든 행 + 02-api.md action 매핑.
 *
 * 매핑 근거(00-domain.md 표 행 순서대로):
 * 1. (생성)→REQUESTED, supplier            → { from: NONE, action: CREATE, role: supplier }
 * 2. REQUESTED→ACCEPTED, rider              → { from: REQUESTED, action: ACCEPT, role: rider }
 * 3. ACCEPTED→ARRIVED, rider                → { from: ACCEPTED, action: ARRIVE, role: rider }
 * 4. ARRIVED→PICKED_UP, rider(계량+사진)+supplier(승인)
 *    → 02-api.md에서 두 액션으로 분리:
 *      4a. rider가 계량 제출: 상태 유지(ARRIVED) → { from: ARRIVED, action: SUBMIT_MEASURE, role: rider, to: ARRIVED }
 *      4b. supplier가 확인 승인: →PICKED_UP        → { from: ARRIVED, action: CONFIRM_MEASURE, role: supplier, to: PICKED_UP }
 * 5. ARRIVED→DISPUTED, supplier              → { from: ARRIVED, action: DISPUTE, role: supplier }
 * 6. DISPUTED→PICKED_UP, admin                → { from: DISPUTED, action: RESOLVE_DISPUTE, role: admin }
 * 7. PICKED_UP→DELIVERED, rider(QR)→즉시 COMPLETED(시스템)
 *    → 02-api.md DELIVER 액션이 DELIVERED를 거쳐 즉시 COMPLETED까지 처리하므로
 *      rider 관점 최종 도착 상태를 COMPLETED로 둔다:
 *      { from: PICKED_UP, action: DELIVER, role: rider, to: COMPLETED }
 *      (DELIVERED는 처리 도중 스쳐가는 중간 상태 — 8번 행은 트리거가 "시스템"이라
 *      역할 기반 canTransition의 대상이 아니라 DELIVER의 부수효과로 흡수한다.)
 * 8. DELIVERED→COMPLETED, 시스템               → DELIVER 처리에 흡수(위 설명). 별도 행 없음.
 * 9. REQUESTED→CANCELLED, supplier             → { from: REQUESTED, action: CANCEL, role: supplier }
 * 10. ACCEPTED→CANCELLED, admin만                → { from: ACCEPTED, action: CANCEL, role: admin }
 *
 * REQUESTED→CANCELLED(시스템/30분 무수락)는 order-expire cron이 service_role로 직접
 * 처리하는 자동화이며 역할 기반 canTransition 대상이 아니다(actor가 "시스템").
 */
export const TRANSITIONS: readonly OrderTransitionRule[] = [
  {
    from: ORDER_NONE,
    action: "CREATE",
    role: "supplier",
    to: "REQUESTED",
    guard: "진행중 주문(REQUESTED~PICKED_UP) 3건 미만",
  },
  {
    from: "REQUESTED",
    action: "ACCEPT",
    role: "rider",
    to: "ACCEPTED",
    guard: "rider verified & online & 진행중 주문 없음. 선착순 1명(조건부 update 락)",
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
    guard: "배정 rider 본인. measuredKg + photoUrls(>=1) 필수. 상태는 ARRIVED 유지",
  },
  {
    from: "ARRIVED",
    action: "CONFIRM_MEASURE",
    role: "supplier",
    to: "PICKED_UP",
    guard: "주문 본인 supplier. final_kg=measured_kg. EARN+HOLD 지급",
  },
  {
    from: "ARRIVED",
    action: "DISPUTE",
    role: "supplier",
    to: "DISPUTED",
    guard: "주문 본인 supplier. reason 필수",
  },
  {
    from: "DISPUTED",
    action: "RESOLVE_DISPUTE",
    role: "admin",
    to: "PICKED_UP",
    guard: "admin 중재. finalKg로 EARN+HOLD 지급(CONFIRM_MEASURE와 동일 지급 로직)",
  },
  {
    from: "PICKED_UP",
    action: "DELIVER",
    role: "rider",
    to: "COMPLETED",
    guard: "배정 rider. depot.qr_secret 일치 검증. RELEASE(rider) 후 DELIVERED 경유 즉시 COMPLETED",
  },
  {
    from: "REQUESTED",
    action: "CANCEL",
    role: "supplier",
    to: "CANCELLED",
    guard: "수락 전(REQUESTED) 언제나 취소 가능",
  },
  {
    from: "ACCEPTED",
    action: "CANCEL",
    role: "admin",
    to: "CANCELLED",
    guard: "admin만. 라이더 노쇼 등. REQUESTED 재생성은 admin 수동",
  },
] as const;

/**
 * (from, action, role) 조합이 유효한 전이인지 판정하는 순수 함수.
 * 표에 없는 조합은 반드시 false를 반환한다.
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

/** 유효한 전이일 때의 목적지 상태를 반환. 유효하지 않으면 undefined. */
export function getTransitionTarget(
  from: OrderStatusOrNone,
  action: OrderAction,
  role: UserRole,
): OrderStatus | undefined {
  return TRANSITIONS.find(
    (rule) => rule.from === from && rule.action === action && rule.role === role,
  )?.to;
}

/** 특정 role이 특정 from 상태에서 실행 가능한 액션 목록 (UI 버튼 노출용). */
export function getAvailableActions(
  from: OrderStatusOrNone,
  role: UserRole,
): OrderAction[] {
  return TRANSITIONS.filter((rule) => rule.from === from && rule.role === role).map(
    (rule) => rule.action,
  );
}

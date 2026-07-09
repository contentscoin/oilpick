# 02. Edge Functions API 명세

공통:
- 모든 함수는 `supabase/functions/<name>/index.ts` (Deno).
- 인증: `Authorization: Bearer <supabase JWT>` 필수 (verify_jwt). 함수 내에서 auth.uid + profiles.role 확인.
- 입력은 zod 스키마(packages/core에 정의, 함수와 클라이언트 공유)로 검증. 실패 시 400.
- 응답: 성공 `{ ok: true, data }`, 실패 `{ ok: false, code, message }` + HTTP 상태코드.
- 에러 코드 상수는 `packages/core/src/errorCodes.ts`에 정의.
- DB 접근은 service_role 클라이언트. 상태 전이+원장 기록은 **단일 Postgres 함수(RPC) 호출로 트랜잭션 보장** —
  Edge Function에서 다건 쿼리로 쪼개지 말 것. 핵심 RPC: `fn_transition_order`, `fn_post_ledger`,
  **`fn_charge_coupon`(CHARGE/ADJUST), `fn_consume_coupon`(CONSUME, rider 단위 FOR UPDATE 직렬화 후 잔액 재계산 → 부족 시 `INSUFFICIENT_COUPON` 예외)** (07 F3a).
- **PG(토스페이먼츠) 시크릿 키는 Edge Function 전용**(supabase secrets) — 클라이언트 번들엔 클라이언트 키만(절대 규칙 3 확장, 07 §1-4).

읽기 전용 조회(시세, 주문 목록, 원장, 알림)는 Edge Function을 만들지 않는다 —
클라이언트가 RLS 하에서 supabase-js로 직접 select한다.

---

## 1. `order-create` (supplier)
수거 요청 생성.
- 입력: `{ requestedCans?: number, requestedKg: number, address: string, lat: number, lng: number, preferredTime: string }`
- 검증: requestedKg 1~500. 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 `TOO_MANY_ACTIVE`.
- 처리: 최신 price_tick 시세 스냅샷 + **`coupon_cost = ceil(requestedKg / KG_PER_CAN)` 스냅샷**(07 §1-2, D2) →
  pickup_orders insert (REQUESTED) → order_events → 반경 3km 매칭 브로드캐스트 (아래 `broadcastCall` 헬퍼).
  **rider_fee 스냅샷 중지**(레거시, snapshot_rider_fee 미기록).
- 출력: `{ orderId, snapshotPricePerKg, couponCost, estimatedCash }` (07 F3b-① — estimatedPoint→estimatedCash 계약 개정)

`broadcastCall(orderId, radiusKm)`: rider_profiles에서 `verify_status='APPROVED' and is_online
and last_location 반경 내 and 진행중 주문 없음` 검색 → FCM 멀티캐스트 + notifications insert.

## 2. `order-accept` (rider)
- 입력: `{ orderId }`
- 가드: verified·online·**진행중 주문 없음(ACCEPTED/ARRIVED/PICKED_UP/DISPUTED 포함**, idx_rider_single_active_order와 정합 — 07 F3b-②). 아니면 403 `RIDER_NOT_ELIGIBLE`.
- **쿠폰 사전 체크(fail-fast, UX용)**: `v_coupon_balance.balance ≥ coupon_cost` 아니면 409 `INSUFFICIENT_COUPON`
  ("수거쿠폰이 부족해요. 충전 후 수락할 수 있어요."). coupon_cost null(레거시)은 skip.
- 처리: fn_transition_order ACCEPT — 조건부 `update ... where status='REQUESTED'`(0행이면 409 `ALREADY_ACCEPTED`) 성공 시
  **같은 트랜잭션에서 coupon_cost not null이면 fn_consume_coupon(CONSUME, -coupon_cost)** 실행. 부족 예외 시 ACCEPT 전체 롤백(주문 REQUESTED 잔존).
  **동시성 방어의 유일한 진실은 RPC**(위 fail-fast는 UX용). `mapTransitionError`에 `INSUFFICIENT_COUPON → 409` 매핑 추가.
- 부수효과: order_events, supplier 푸시.

## 3. `order-transition` (rider/supplier/admin)
ACCEPTED 이후 모든 전이 단일 엔드포인트.
- 입력: `{ orderId, action, payload? }`
- action별:

| action | actor | payload | 처리 |
|---|---|---|---|
| `ARRIVE` | 배정 rider | — | →ARRIVED, supplier 푸시 |
| `SUBMIT_MEASURE` | 배정 rider | `{ measuredKg, photoUrls[] (≥1) }` | measured_kg/photo_urls 저장 (상태 유지 ARRIVED), supplier 푸시 "계량 결과 도착 — 무게·현금 확인" |
| `CONFIRM_MEASURE` | supplier 본인 | — | **→COMPLETED**(2자 확인=무게+현금 수령 확인). final_kg=measured_kg, `cash_paid_amount=round(final_kg×snapshot_price_per_kg)`, `completed_at=now()`. **EARN/HOLD 발행 제거**(07 F3a). rider 푸시 "현금 지급 확인" |
| `DISPUTE` | supplier 본인 | `{ reason }` | →DISPUTED, admin 알림 |
| `RESOLVE_DISPUTE` | admin | `{ finalKg }` | **→ARRIVED**(의미 재정의: 중재는 kg 확정까지만 — final_kg 고정, 이후 SUBMIT_MEASURE 재제출 불가). 현금 지급·수령 확인이 남아 일반 CONFIRM_MEASURE 경로로 COMPLETED. 양쪽 알림 |
| `FORCE_COMPLETE` | admin (D6) | `{ memo }` (필수) | **→COMPLETED** — ARRIVED + 계량(또는 중재) kg 존재 시에만. 제출/중재 kg 기반 cash_paid_amount+completed_at 기록 + order_events. 점주 수령 확인 교착 해소용, CS(F12) 연동. 양쪽 알림 |
| `DELIVER` | 배정 rider | `{ depotId, qrSecret }` | **레거시 전용**(PICKED_UP 잔존분 완결). qr_secret 검증(불일치 400 `INVALID_QR`) → DELIVERED → RELEASE → COMPLETED. 신규 주문 도달 불가 |
| `CANCEL` | supplier(REQUESTED만) / admin({ACCEPTED\|ARRIVED\|DISPUTED}) | `{ reason, fault? }` | →CANCELLED. **admin 취소 시 `fault` 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'`, D4·D6). SUPPLIER/SYSTEM → coupon_ledger REFUND(+coupon_cost)(단 동일 order_id+rider_id CONSUME 존재·qty 일치 확인, 없으면 skip). RIDER → 환급 없음 |

- 전이 유효성은 packages/core `orderMachine.canTransition(from, action, role)` 재사용. 위반 409 `INVALID_TRANSITION`.
- coupon_ledger CONSUME/REFUND insert는 unique(order_id, entry_type, rider_id) 제약으로 멱등 — 중복 요청 시 conflict를 잡아 재응답.
- **알림은 00-domain.md 알림 매트릭스(07 §1-6)를 단일 진실로 참조** — `notifyForAction`(index.ts) 분기를 매트릭스대로 개정(구모델 "포인트 지급"·"수거비 보류" 거짓 푸시 제거, 현금 확인 요청/완료/환급 카피, 07 F3b-③).

## 4. `order-expire` (cron, 1분마다 — Supabase scheduled function)
- REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km, 30분→CANCELLED(NO_RIDER)+푸시.
- broadcast_radius_km 컬럼으로 현재 단계 추적 (중복 브로드캐스트 방지).

## 5. `rider-location` (rider)
- 입력: `{ lat, lng }` — 운행 중(ACCEPTED~PICKED_UP 보유) 15초 간격 호출.
- 처리: rider_profiles.last_location 갱신. 진행중 주문 있으면 Realtime broadcast 채널
  `order:{orderId}:location`으로 좌표 push (supplier 지도용).

## 6. `rider-verify` (admin)
- 입력: `{ riderId, decision: 'APPROVED'|'REJECTED'|'SUSPENDED'|'REINSTATED', rejectReason? }`
- 처리: verify_status 갱신 + rider 푸시(§1-6 인증 승인/반려·정지/해제).
- **07 F11 — 정지·서류·인계처**:
  - `APPROVED`(최초 승인): 서버 필수 검증 — `doc_permit_url`(폐기물처리(수집·운반) 신고증명서)과
    `recycler_name`/`recycler_contact`(인계처)가 없으면 400 `VALIDATION_ERROR`(message로 사유 명시).
    통과 시 verify_status='APPROVED', reject_reason 초기화.
  - `REJECTED`: rejectReason 필수 → reject_reason 저장.
  - `SUSPENDED`(정지): rejectReason 필수(정지 사유, reject_reason 재사용) → verify_status='SUSPENDED' +
    **is_online 강제 false**. APPROVED 라이더에만 의미. open_calls RLS·order-accept 가드·
    fn_transition_order ACCEPT 게이트가 APPROVED를 요구하므로 정지 즉시 콜 조회/수락 자동 차단
    (진행중 주문은 ACCEPT 외 전이라 완결까지 허용).
  - `REINSTATED`(해제): verify_status='APPROVED' 복귀, reject_reason 초기화(서류 재검증 없음).
  - guard_rider_verify 트리거는 service_role 예외 경로 → 이 Edge Function만 verify_status/is_online 갱신
    가능. authenticated의 셀프 정지·해제 변조는 트리거로 차단.

## 7. `withdraw-request` (supplier/rider)
> ⚠️ **deprecated — 07 D1 포인트 폐기, F13에서 제거 예정.**
- 입력: `{ amount }` (≥10000). 프로필에 계좌 없으면 400 `NO_BANK_ACCOUNT`.
- RPC 트랜잭션: v_point_balance.available >= amount 검증(행 잠금은 원장 insert 직렬화로) →
  WITHDRAW_REQUEST(-amount) → withdrawals insert. 잔액 부족 400 `INSUFFICIENT_BALANCE`.

## 8. `withdraw-process` (admin)
> ⚠️ **deprecated — 07 D1 포인트 폐기, F13에서 제거 예정.**
- 입력: `{ withdrawalId, decision: 'APPROVED'|'REJECTED'|'PAID', memo? }`
- REJECTED 시 WITHDRAW_CANCEL(+amount) 복구. 상태 전이: REQUESTED→APPROVED→PAID 또는 REQUESTED→REJECTED.

## 9. `price-set` (admin)
- 입력: `{ pricePerKg }` → price_ticks insert. **riderFee 입력 삭제**(레거시 — 07 F3b-④, priceSetInputSchema 개정. rider_fee 미기록).

## 10. `point-adjust` (admin)
> ⚠️ **deprecated — 07 D1 포인트 폐기, F13에서 제거 예정.** 쿠폰 수동 조정은 §14 `coupon-adjust` 참조.
- 입력: `{ userId, amount, memo }` (memo 필수) → ADJUST insert.

## 11. `coupon-purchase-intent` (rider) — 07 F4
쿠폰 구매 신청(PG 결제 위젯 진입 전 단계).
- 입력: `{ qty: number }` (1~200 정수)
- 처리: 최신 `coupon_price_ticks` 단가 스냅샷 → `coupon_purchases`(status='PENDING', unit_price 스냅샷,
  amount=qty×unit_price, pg_order_id 생성) insert.
- 출력: `{ purchaseId, pgOrderId, amount, unitPrice }`
- 검증 실패 400. 단가 tick 미설정 시 409 `COUPON_PRICE_NOT_SET` (07 §1-4 확정).

## 12. `coupon-purchase-confirm` (rider) — 07 F4
토스 결제 승인 확정 + 쿠폰 충전(멱등 3중, 07 §1-4).
- 입력: `{ purchaseId, paymentKey, pgOrderId, amount }` (토스 successUrl 파라미터)
- 처리: `coupon_purchases` 행 **FOR UPDATE 잠금 → status=PENDING 재확인 → 시크릿 키로 토스 승인 API 호출 +
  amount 일치 검증 → 같은 트랜잭션에서 fn_charge_coupon(CHARGE, purchase_id) + status=PAID·payment_key 기록**.
  성공 시 "쿠폰 N장 충전 완료" 알림 insert.
- 멱등: 상태 전이 + `payment_key` unique + `coupon_ledger` unique(purchase_id, entry_type). **재호출 안전**(orphan 재시도).
- amount 위변조 시 거부(전이 없음). **PG 시크릿 키는 Edge Function 전용**.
- 출력: `{ balance }` (충전 후 쿠폰 잔액)

## 13. `coupon-refund` (admin) — 07 F4
쿠폰 구매 건 환불(구매 건 단위, 건당 1회 한정, 07 §1-4).
- 입력: `{ purchaseId, qty?, reason }` (qty 생략=전액, 지정=부분 1회)
- 처리: 금액=해당 건 unit_price 스냅샷 기준. **미사용 잔액(v_coupon_balance) ≥ 환불 qty 검증** →
  **rider 단위 FOR UPDATE 직렬화 후 잔액 재계산**(동시 수락 경합 방지) → 원장 `ADJUST(-qty, purchase_id 필수)` +
  `coupon_purchases.status=REFUNDED`(FOR UPDATE 상태 기반 멱등). rider "환급" 알림.
- 미사용 잔액 부족 시 409 `INSUFFICIENT_COUPON` 재사용 — 동일 의미(잔액 부족, 07 §1-4 확정).

## 14. `coupon-adjust` (admin) — 07 F3b-⑤
쿠폰 수동 조정(CS 보조 / 데모 라이더 선지급 20장. point-adjust 패턴 복제).
- 입력: `{ riderId, qty: number, memo: string }` (memo 필수, qty ±)
- 처리: `fn_charge_coupon(ADJUST, ±qty, purchase_id=null, memo, created_by=admin)`.

## 15. `coupon-price-set` (admin) — 07 F3b-⑤
쿠폰 단가 tick 등록(price-set 패턴 복제).
- 입력: `{ unitPrice: number }` (>0) → `coupon_price_ticks` insert.

## 푸시 발송 헬퍼 `_shared/push.ts`
- `sendPush(userIds[], title, body, link)`: profiles.fcm_token 조회 → FCM HTTP v1 멀티캐스트
  + notifications insert. 토큰 만료(UNREGISTERED) 시 fcm_token null 처리.
- FCM 서비스 계정 키는 Supabase secrets `FCM_SERVICE_ACCOUNT`.

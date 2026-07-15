# 02. Edge Functions API 명세

공통:
- 모든 함수는 `supabase/functions/<name>/index.ts` (Deno).
- 인증: `Authorization: Bearer <supabase JWT>` 필수 (verify_jwt). 함수 내에서 auth.uid + profiles.role 확인.
- 입력은 zod 스키마(packages/core에 정의, 함수와 클라이언트 공유)로 검증. 실패 시 400.
- 응답: 성공 `{ ok: true, data }`, 실패 `{ ok: false, code, message }` + HTTP 상태코드.
- 에러 코드 상수는 `packages/core/src/errorCodes.ts`에 정의.
- DB 접근은 service_role 클라이언트. 상태 전이+원장 기록은 **단일 Postgres 함수(RPC) 호출로 트랜잭션 보장** —
  Edge Function에서 다건 쿼리로 쪼개지 말 것. 핵심 RPC: `fn_transition_order`, `fn_post_ledger`(EARN/ADJUST),
  **`fn_request_withdraw`/`fn_process_withdraw`(출금 — 08 P4 복권)**.
  레거시 RPC(전환기·회계 보존): fn_charge_coupon/fn_consume_coupon/fn_confirm_purchase/fn_refund_purchase.
- **PG 결제 경로는 일몰**(08 P1 — 쿠폰 구매 폐기). `_shared/pg.ts` 어댑터·시크릿 격리 원칙 기록은
  07-pivot-plan.md F4/F14 참조(코드 삭제됨, 미래 결제 기능 시 선례로 재사용).

읽기 전용 조회(시세, 주문 목록, 원장, 잔액 뷰, 알림)는 Edge Function을 만들지 않는다 —
클라이언트가 RLS 하에서 supabase-js로 직접 select한다.

---

## 1. `order-create` (supplier)
수거 요청 생성.
- 입력: `{ requestedCans?: number, requestedKg: number, address: string, lat: number, lng: number, preferredTime: string }`
  (18L/10L 통 수는 클라이언트에서 `estimateKg(cans, canSizeL)`로 kg 환산해 requestedKg로 전달 — 08 P6)
- 검증: requestedKg 1~500. 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 `TOO_MANY_ACTIVE`.
- 처리: 최신 price_tick 시세 스냅샷 → pickup_orders insert (REQUESTED) → order_events → 반경 3km 매칭
  브로드캐스트 (아래 `broadcastCall` 헬퍼). **coupon_cost 스냅샷 중지**(08 P1 — 신규 주문 항상 null).
  rider_fee 스냅샷 중지 유지(07 레거시).
- 출력: `{ orderId, snapshotPricePerKg, estimatedCash }` (08 G3-① — couponCost 필드 삭제)

`broadcastCall(orderId, radiusKm)`: rider_profiles에서 `verify_status='APPROVED' and is_online
and last_location 반경 내 and 진행중 주문 없음` 검색 → FCM 멀티캐스트 + notifications insert.

## 2. `order-accept` (rider)
- 입력: `{ orderId }`
- 가드: verified·online·**진행중 주문 없음(ACCEPTED/ARRIVED/PICKED_UP/DISPUTED 포함**, idx_rider_single_active_order와 정합). 아니면 403 `RIDER_NOT_ELIGIBLE`.
- **쿠폰 사전 체크 삭제**(08 P1 — 신규 주문 coupon_cost null). `mapTransitionError`의
  `INSUFFICIENT_COUPON → 409` 매핑은 전환기 잔존 쿠폰 주문(coupon_cost not null) 대비로 보존.
- 처리: fn_transition_order ACCEPT — 조건부 `update ... where status='REQUESTED'`(0행이면 409 `ALREADY_ACCEPTED`).
  잔존 쿠폰 주문이면 RPC가 레거시 CONSUME 분기를 통과(동시성 방어의 유일한 진실은 RPC).
- 부수효과: order_events, supplier 푸시.

## 3. `order-transition` (rider/supplier/admin)
ACCEPTED 이후 모든 전이 단일 엔드포인트.
- 입력: `{ orderId, action, payload? }`
- action별:

| action | actor | payload | 처리 |
|---|---|---|---|
| `ARRIVE` | 배정 rider | — | →ARRIVED, supplier 푸시 |
| `SUBMIT_MEASURE` | 배정 rider | `{ measuredKg, photoUrls[] (≥1), payoutMethod: 'CASH'\|'POINT' }` (**payoutMethod 필수 — 08 P2**. RPC는 생략 시 CASH 폴백으로 구버전 호환) | measured_kg/photo_urls/**payout_method** 저장 (상태 유지 ARRIVED). supplier 푸시 — CASH "무게·현금 ₩N 확인" / POINT "확인 시 포인트 N P 적립". 재제출로 수단 변경 가능(final_kg 고정 전) |
| `CONFIRM_MEASURE` | supplier 본인 | — | **→COMPLETED**(2자 확인=무게+지급 확인). final_kg 확정, `cash_paid_amount=round(final_kg×snapshot_price_per_kg)`, `completed_at=now()`. **payout_method='POINT'면 같은 트랜잭션에서 fn_post_ledger EARN(+지급액) 발행**(08 P3, null=CASH 간주). rider 푸시(수단별) + POINT면 supplier 적립 푸시 |
| `DISPUTE` | supplier 본인 | `{ reason }` | →DISPUTED, admin 알림 |
| `RESOLVE_DISPUTE` | admin | `{ finalKg }` | **→ARRIVED**(중재는 kg 확정까지만 — final_kg 고정, 이후 SUBMIT_MEASURE 재제출 불가). 지급·수령 확인이 남아 일반 CONFIRM_MEASURE 경로로 COMPLETED. 양쪽 알림 |
| `FORCE_COMPLETE` | admin | `{ memo }` (필수) | **→COMPLETED** — ARRIVED + 계량(또는 중재) kg 존재 시에만. CONFIRM_MEASURE와 동일 지급 로직(**POINT면 EARN 발행**) + order_events. 점주 수령 확인 교착 해소용, CS 연동. 양쪽 알림 |
| `DELIVER` | 배정 rider | `{ depotId, qrSecret }` | **레거시 전용**(PICKED_UP 잔존분 완결). qr_secret 검증(불일치 400 `INVALID_QR`) → DELIVERED → COMPLETED. 지급 없음. 신규 주문 도달 불가 |
| `CANCEL` | supplier(REQUESTED만) / admin({ACCEPTED\|ARRIVED\|DISPUTED}) | `{ reason, fault? }` | →CANCELLED. **admin 취소 시 `fault` 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'` — 감사 기록). 쿠폰 REFUND는 레거시 잔존 주문(CONSUME 존재·qty 일치)에서만 |

- 전이 유효성은 packages/core `orderMachine.canTransition(from, action, role)` 재사용. 위반 409 `INVALID_TRANSITION`.
- **알림은 00-domain.md 알림 매트릭스(08 §1-5)를 단일 진실로 참조** — `buildActionNotifications` 분기를
  매트릭스대로 개정(지급수단별 카피 분기, 08 G3-④).

## 4. `order-expire` (cron, 1분마다 — Supabase scheduled function)
- REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km, 30분→CANCELLED(NO_RIDER)+푸시.
- broadcast_radius_km 컬럼으로 현재 단계 추적 (중복 브로드캐스트 방지).

## 5. `rider-location` (rider)
- 입력: `{ lat, lng }` — 운행 중(ACCEPTED~PICKED_UP 보유) 15초 간격 호출.
- 처리: rider_profiles.last_location 갱신. 진행중 주문 있으면 Realtime broadcast 채널
  `order:{orderId}:location`으로 좌표 push (supplier 지도용).

## 6. `rider-verify` (admin)
- 입력: `{ riderId, decision: 'APPROVED'|'REJECTED'|'SUSPENDED'|'REINSTATED', rejectReason? }`
- 처리: verify_status 갱신 + rider 푸시(§1-5 인증 승인/반려·정지/해제).
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
> ✅ **부활 (08 P4·G3-⑤)** — F13이 삭제했던 함수를 git 이력 기반으로 복원(계약 동일).
- 입력: `{ amount }` (≥10000, `MIN_WITHDRAW`). 프로필에 계좌 없으면 400 `NO_BANK_ACCOUNT`.
- 처리: 계좌 사전 확인 후 **`fn_request_withdraw` RPC 단일 호출** — user 단위 FOR UPDATE 직렬화 →
  잔액 재계산(v_point_balance.available ≥ amount) → WITHDRAW_REQUEST(-amount) + withdrawals insert 원자.
  잔액 부족 400 `INSUFFICIENT_BALANCE`.
- 출력: `{ withdrawalId, status, amount }`

## 8. `withdraw-process` (admin)
> ✅ **부활 (08 P4·G3-⑤)** — F13이 삭제했던 함수를 git 이력 기반으로 복원(계약 동일).
- 입력: `{ withdrawalId, decision: 'APPROVED'|'REJECTED'|'PAID', memo? }`
- 처리: **`fn_process_withdraw` RPC 단일 호출**. REJECTED 시 WITHDRAW_CANCEL(+amount) 복구(withdrawal_id 멱등).
  상태 전이: REQUESTED→APPROVED→PAID 또는 REQUESTED→REJECTED. 위반 409 `INVALID_TRANSITION`.
- 부수효과: supplier 푸시 — "출금 신청이 승인되었어요"/"출금이 완료되었어요"/"출금 신청이 반려되어
  포인트가 복구되었어요" (§1-5), link `/wallet`.
- 출력: `{ withdrawalId, status }`

## 9. `price-set` (admin)
- 입력: `{ pricePerKg }` → price_ticks insert. riderFee 입력 없음(07 레거시).

## 10. `point-adjust` (admin)
> ✅ **부활 (08 P4·G3-⑤)** — CS 수동 조정 경로 복원.
- 입력: `{ userId, amount, memo }` (memo 필수, amount ± 정수) → `fn_post_ledger`(ADJUST) insert.
- 음수 조정으로 잔액이 음수가 되는 것은 admin 책임(원장 감사로 추적) — 구계약 유지.

## 11~15. `coupon-*` (coupon-purchase-intent/confirm/return, coupon-refund, coupon-adjust, coupon-price-set)
> ⚠️ **삭제됨 (08 P1·G3-⑥)** — 수거쿠폰 모델 폐기. Edge Function 코드 6종 저장소에서 삭제.
> **프로덕션 undeploy는 08 배포 체크리스트 ⓔ**(앱 배포 완료 후 — 가동 중 구버전 앱 파손 방지).
> DB RPC(fn_charge_coupon/fn_consume_coupon/fn_confirm_purchase/fn_refund_purchase)·테이블·과거
> 데이터는 회계 감사용 보존(삭제 금지). 구계약 전문은 git 이력과 07-pivot-plan.md F4/F14 참조.

## 푸시 발송 헬퍼 `_shared/push.ts`
- `sendPush(userIds[], title, body, link)`: profiles.fcm_token 조회 → FCM HTTP v1 멀티캐스트
  + notifications insert. 토큰 만료(UNREGISTERED) 시 fcm_token null 처리.
- FCM 서비스 계정 키는 Supabase secrets `FCM_SERVICE_ACCOUNT`.

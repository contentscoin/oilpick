# 02. Edge Functions API 명세

공통:
- 모든 함수는 `supabase/functions/<name>/index.ts` (Deno).
- 인증: `Authorization: Bearer <supabase JWT>` 필수 (verify_jwt). 함수 내에서 auth.uid + profiles.role 확인.
- 입력은 zod 스키마(packages/core에 정의, 함수와 클라이언트 공유)로 검증. 실패 시 400.
- 응답: 성공 `{ ok: true, data }`, 실패 `{ ok: false, code, message }` + HTTP 상태코드.
- 에러 코드 상수는 `packages/core/src/errorCodes.ts`에 정의.
- DB 접근은 service_role 클라이언트. 상태 전이+원장 기록은 **단일 Postgres 함수(RPC) 호출로 트랜잭션 보장** —
  Edge Function에서 다건 쿼리로 쪼개지 말 것. 핵심 RPC: `fn_transition_order`, `fn_post_ledger`.

읽기 전용 조회(시세, 주문 목록, 원장, 알림)는 Edge Function을 만들지 않는다 —
클라이언트가 RLS 하에서 supabase-js로 직접 select한다.

---

## 1. `order-create` (supplier)
수거 요청 생성.
- 입력: `{ requestedCans?: number, requestedKg: number, address: string, lat: number, lng: number, preferredTime: string }`
- 검증: requestedKg 1~500. 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 `TOO_MANY_ACTIVE`.
- 처리: 최신 price_tick 스냅샷 → pickup_orders insert (REQUESTED) → order_events →
  반경 3km 매칭 브로드캐스트 (아래 `broadcastCall` 헬퍼) 
- 출력: `{ orderId, snapshotPricePerKg, snapshotRiderFee, estimatedPoint }`

`broadcastCall(orderId, radiusKm)`: rider_profiles에서 `verify_status='APPROVED' and is_online
and last_location 반경 내 and 진행중 주문 없음` 검색 → FCM 멀티캐스트 + notifications insert.

## 2. `order-accept` (rider)
- 입력: `{ orderId }`
- 가드: verified·online·진행중 주문 없음. 아니면 403 `RIDER_NOT_ELIGIBLE`.
- 동시성: `update pickup_orders set status='ACCEPTED', rider_id=$rider, accepted_at=now()
  where id=$id and status='REQUESTED' returning *` — 0행이면 409 `ALREADY_ACCEPTED`.
- 부수효과: order_events, supplier 푸시.

## 3. `order-transition` (rider/supplier/admin)
ACCEPTED 이후 모든 전이 단일 엔드포인트.
- 입력: `{ orderId, action, payload? }`
- action별:

| action | actor | payload | 처리 |
|---|---|---|---|
| `ARRIVE` | 배정 rider | — | →ARRIVED, supplier 푸시 |
| `SUBMIT_MEASURE` | 배정 rider | `{ measuredKg, photoUrls[] (≥1) }` | measured_kg/photo_urls 저장 (상태 유지 ARRIVED), supplier 푸시 "계량 확인 요청" |
| `CONFIRM_MEASURE` | supplier 본인 | — | →PICKED_UP. final_kg=measured_kg. **RPC 트랜잭션**: EARN(supplier, round(final_kg×snapshot_price)) + HOLD(rider, snapshot_rider_fee) + supplier_point 저장. 푸시 양쪽 |
| `DISPUTE` | supplier 본인 | `{ reason }` | →DISPUTED, admin 알림 |
| `RESOLVE_DISPUTE` | admin | `{ finalKg }` | →PICKED_UP, final_kg=finalKg로 CONFIRM_MEASURE와 동일 지급 |
| `DELIVER` | 배정 rider | `{ depotId, qrSecret }` | qr_secret 일치 검증(불일치 400 `INVALID_QR`) → →DELIVERED → RELEASE(rider) → 즉시 →COMPLETED. rider 푸시 |
| `CANCEL` | supplier(REQUESTED만)/admin | `{ reason }` | →CANCELLED |

- 전이 유효성은 packages/core `orderMachine.canTransition(from, action, role)` 재사용. 위반 409 `INVALID_TRANSITION`.
- EARN/HOLD insert는 unique(order_id, entry_type, user_id) 제약으로 멱등 — 중복 요청 시 conflict를 잡아 200 재응답.

## 4. `order-expire` (cron, 1분마다 — Supabase scheduled function)
- REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km, 30분→CANCELLED(NO_RIDER)+푸시.
- broadcast_radius_km 컬럼으로 현재 단계 추적 (중복 브로드캐스트 방지).

## 5. `rider-location` (rider)
- 입력: `{ lat, lng }` — 운행 중(ACCEPTED~PICKED_UP 보유) 15초 간격 호출.
- 처리: rider_profiles.last_location 갱신. 진행중 주문 있으면 Realtime broadcast 채널
  `order:{orderId}:location`으로 좌표 push (supplier 지도용).

## 6. `rider-verify` (admin)
- 입력: `{ riderId, decision: 'APPROVED'|'REJECTED', rejectReason? }`
- 처리: verify_status 갱신 + rider 푸시.

## 7. `withdraw-request` (supplier/rider)
- 입력: `{ amount }` (≥10000). 프로필에 계좌 없으면 400 `NO_BANK_ACCOUNT`.
- RPC 트랜잭션: v_point_balance.available >= amount 검증(행 잠금은 원장 insert 직렬화로) →
  WITHDRAW_REQUEST(-amount) → withdrawals insert. 잔액 부족 400 `INSUFFICIENT_BALANCE`.

## 8. `withdraw-process` (admin)
- 입력: `{ withdrawalId, decision: 'APPROVED'|'REJECTED'|'PAID', memo? }`
- REJECTED 시 WITHDRAW_CANCEL(+amount) 복구. 상태 전이: REQUESTED→APPROVED→PAID 또는 REQUESTED→REJECTED.

## 9. `price-set` (admin)
- 입력: `{ pricePerKg, riderFee }` → price_ticks insert.

## 10. `point-adjust` (admin)
- 입력: `{ userId, amount, memo }` (memo 필수) → ADJUST insert.

## 푸시 발송 헬퍼 `_shared/push.ts`
- `sendPush(userIds[], title, body, link)`: profiles.fcm_token 조회 → FCM HTTP v1 멀티캐스트
  + notifications insert. 토큰 만료(UNREGISTERED) 시 fcm_token null 처리.
- FCM 서비스 계정 키는 Supabase secrets `FCM_SERVICE_ACCOUNT`.

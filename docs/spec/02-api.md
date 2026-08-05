# 02. Edge Functions API 명세

공통:
- 모든 함수는 `supabase/functions/<name>/index.ts` (Deno).
- 인증: `Authorization: Bearer <supabase JWT>` 필수 (verify_jwt). 함수 내에서 auth.uid + profiles.role 확인.
- 입력은 zod 스키마(packages/core에 정의, 함수와 클라이언트 공유)로 검증. 실패 시 400.
- 응답: 성공 `{ ok: true, data }`, 실패 `{ ok: false, code, message }` + HTTP 상태코드.
- 에러 코드 상수는 `packages/core/src/errorCodes.ts`에 정의.
- DB 접근은 service_role 클라이언트. 상태 전이+원장 기록은 **단일 Postgres 함수(RPC) 호출로 트랜잭션 보장** —
  Edge Function에서 다건 쿼리로 쪼개지 말 것. 핵심 RPC: `fn_transition_order`, `fn_post_ledger`(EARN/ADJUST),
  **`fn_request_withdraw`/`fn_process_withdraw`(출금 — 08 P4 복권)**,
  **`fn_charge_coupon`(CHARGE/ADJUST)/`fn_consume_coupon`(CONSUME)/`fn_confirm_purchase`/
  `fn_refund_purchase`(쿠폰 — [17 Q2] 복권, 08이 레거시로 강등했던 것을 현역 복귀. DB 무변경)**.
- **PG 결제 경로는 현역**([17 Q2] 복권 — 08 P1 일몰을 역전). `_shared/pg.ts` 어댑터
  (`PG_PROVIDER: koem|demo|toss`, **기본 koem** — 17 C3) + `_shared/koem.ts`/`_shared/toss.ts`.
  PG 시크릿(KOEM_MID/KOEM_API_KEY/TOSS_SECRET_KEY)은 Edge 전용(절대 규칙 3 확장) — DEPLOY.md.

읽기 전용 조회(시세, 주문 목록, 원장, 잔액 뷰, 알림)는 Edge Function을 만들지 않는다 —
클라이언트가 RLS 하에서 supabase-js로 직접 select한다.

---

## 1. `order-create` (supplier)
수거 요청 생성.
- 입력: `{ requestedCans?: number, requestedKg: number, address: string, lat: number, lng: number, preferredTime: string }`
  (18L/10L 통 수는 클라이언트에서 `estimateKg(cans, canSizeL)`로 kg 환산해 requestedKg로 전달 — 08 P6)
- 검증: requestedKg 1~500. 진행중(REQUESTED~PICKED_UP) 주문 3건 이상이면 409 `TOO_MANY_ACTIVE`.
- 처리: 최신 price_tick 시세 스냅샷 + **[17 Q2 복권] `coupon_cost = ceil(requestedKg / KG_PER_CAN)`
  스냅샷 재개**(17 C1, 07 §1-2 공식 그대로 — 0이면(구매 단독 주문) null 저장 = 게이트 불요) →
  pickup_orders insert (REQUESTED) → order_events → 반경 3km 매칭 브로드캐스트 (아래 `broadcastCall`
  헬퍼). rider_fee 스냅샷 중지 유지(07 레거시).
- 출력: `{ orderId, snapshotPricePerKg, estimatedCash }` (couponCost 출력 필드는 08 G3-① 삭제 유지 —
  라이더는 pickup_orders.coupon_cost를 직접 조회하므로 supplier 응답 계약은 확장하지 않는다)

`broadcastCall(orderId, radiusKm)`: rider_profiles에서 `verify_status='APPROVED' and is_online
and last_location 반경 내 and 진행중 주문 없음` 검색 → FCM 멀티캐스트 + notifications insert.

## 2. `order-accept` (rider)
- 입력: `{ orderId }`
- 가드: verified·online·**활성 주문 상한 미만**(ACCEPTED/ARRIVED/PICKED_UP/DISPUTED 합계 < `MAX_RIDER_ACTIVE_ORDERS`=3).
  verified/online 위반은 403 `RIDER_NOT_ELIGIBLE`, 상한 초과는 409 `RIDER_TOO_MANY_ACTIVE`.
  ⚠️ Edge 가드는 **fail-fast 선차단**일 뿐이고 진짜 방어는 RPC다 — 동시 수락은 Edge를 둘 다 통과할 수 있고,
  `fn_transition_order` ACCEPT의 advisory lock(`rider_active:{riderId}`) + 카운트 체크가 상한을 강제한다.
  (구 설계는 유니크 인덱스 `idx_rider_single_active_order`로 1건을 강제했다 — "N건 이하"는 유니크로 표현 불가해 RPC로 이관.)
- **[17 Q2] 쿠폰 수락 게이트 부활**(17 C1): order-create가 coupon_cost 스냅샷을 재개했으므로
  `fn_transition_order` ACCEPT의 CONSUME 게이트(`coupon_cost is not null`이면 fn_consume_coupon)가
  신규 주문에 다시 걸린다. 잔액 부족은 RPC raise → `mapTransitionError`의 `INSUFFICIENT_COUPON → 409`
  매핑으로 반환("수거쿠폰이 부족해요. 충전 후 수락할 수 있어요." + 클라 [충전하러 가기] CTA — Q3).
  Edge 사전 체크(fail-fast)는 두지 않는다 — 게이트의 유일한 진실은 RPC(동시 수락 오버스펜드 방어 포함).
  부활 이전 무쿠폰 주문(coupon_cost null)은 게이트 없이 수락되는 것이 정상(전환기 규약, 17 리스크).
- 처리: fn_transition_order ACCEPT — 조건부 `update ... where status='REQUESTED'`(0행이면 409 `ALREADY_ACCEPTED`).
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
| `CANCEL` | supplier(REQUESTED만) / admin({ACCEPTED\|ARRIVED\|DISPUTED}) | `{ reason, fault? }` | →CANCELLED. **admin 취소 시 `fault` 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'` — 감사 기록). **[17 복권] SUPPLIER/SYSTEM 귀책이면 쿠폰 REFUND(+coupon_cost)** — 동일 order_id+rider_id CONSUME 존재·qty 일치 시(없으면 skip, RIDER 귀책 환급 없음) |

- 전이 유효성은 packages/core `orderMachine.canTransition(from, action, role)` 재사용. 위반 409 `INVALID_TRANSITION`.
- **알림은 00-domain.md 알림 매트릭스(08 §1-5)를 단일 진실로 참조** — `buildActionNotifications` 분기를
  매트릭스대로 개정(지급수단별 카피 분기, 08 G3-④).
- **[09 H7] 추천 활성화 훅**: 완료 전이(status='COMPLETED')가 성공한 뒤 `fn_activate_referral(supplier_id, order_id)`를
  호출한다(best-effort·비차단, 멱등 no-op). fn_transition_order 본체는 무변경(레퍼럴은 순수 추가 — 상태머신 오염 방지).
  방금 활성화된 경우(SIGNED_UP→ACTIVATED)에만 점주("추천 보너스 N P 적립" → /wallet)·라이더("추천 실적 적립" → /referrals) 푸시.

## 4. `order-expire` (cron, 1분마다 — Supabase scheduled function)
- REQUESTED이고 created_at 경과별 처리: 5분→반경 7km 재브로드캐스트, 10분→15km, 30분→CANCELLED(NO_RIDER)+푸시.
- broadcast_radius_km 컬럼으로 현재 단계 추적 (중복 브로드캐스트 방지).
- **[16 L5 개정] ARRIVED 확인 리마인드 단계 추가**: ARRIVED ∧ measured_kg not null(DISPUTED 제외) 주문에
  대해 기산점(order_events 최근 SUBMIT_MEASURE — payload.measuredKg 보유 행) 기준
  **2h/12h → supplier** 리마인드 푸시(kind=CONFIRM_REMIND_AUTO), **24h → admin** 에스컬레이션
  (kind=CONFIRM_ESCALATION — 기존 OrdersPage 24h 하이라이트의 능동화). 중복 발화 방지는
  notifications 발송 이력 사다리 판정(`ladderShouldSend` 순수 함수, deno test 고정) — 스키마 변경 0,
  재제출로 기산점이 갱신되면 사다리도 리셋. **상태는 일절 바꾸지 않는다**(순수 알림). 응답에
  `reminded`/`escalated` 카운트 추가.

## 5. `rider-location` (rider)
- 입력: `{ lat, lng }` — 운행 중(ACCEPTED~PICKED_UP 보유) 15초 간격 호출.
- 처리: rider_profiles.last_location 갱신. 진행중 주문 있으면 Realtime broadcast 채널
  `order:{orderId}:location`으로 좌표 push (supplier 지도용).

## 6. `rider-verify` (admin + 좌상)
> [13 D6] 호출자 = admin(전권) 또는 대상 라이더의 **소속 좌상**(dealer, `dealer_id = 호출자`).
> 좌상이 남의 소속을 승인하려 하면 403 `FORBIDDEN`. 나머지 계약은 동일.
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

## 16. `referral-code` (rider) — 09 H3
> 라이더 추천코드 발급/조회. 세션 라이더 본인.
- 입력: 없음(`{}`). role=rider 필수(FORBIDDEN 아니면).
- 처리: `rider_profiles.referral_code`가 있으면 반환, 없으면 Crockford base32 8자를 생성해 unique 저장 후 반환
  (충돌 시 재시도, 동시 생성 방어 = `update ... where referral_code is null`). rider_profiles 행 없으면 404.
- 출력: `{ code, shareUrl }`(`shareUrl = ${REFERRAL_BASE_URL ?? REFERRAL_LINK_BASE}/ref/<CODE>`). `referralCodeOutputSchema`.
- 코드/알파벳/링크 규칙은 packages/core(`generateReferralCode`/`buildReferralShareUrl`)가 단일 진실. APPROVED 검증은
  attach 시점에만(미승인 라이더도 코드는 볼 수 있으나 그 코드로는 활성화되지 않음, 09 §안티어뷰즈).

## 17. `referral-attach` (supplier) — 09 H4
> 점주 가입 직후 저장된 코드로 추천 연결(best-effort, 비차단 — 실패해도 가입 성립).
- 입력: `{ code }`(`referralAttachInputSchema` — trim·대문자 정규화). role=supplier 필수.
- 처리: `fn_attach_referral(supplier_id, code, REFERRAL_SUPPLIER_BONUS, REFERRAL_RIDER_REWARD)`. APPROVED 라이더
  코드만 유효(아니면 400 `INVALID_REFERRAL_CODE`), 점주 1인 1회(멱등 — 기존 행 반환), 자기추천 차단. 이미 다른
  코드로 연결된 점주면 409 `ALREADY_REFERRED`. 원장·referrals 쓰기는 RPC(service_role)에만(절대 규칙 1 확장).
- 출력: `{ status, supplierBonus }`(`referralAttachOutputSchema`).

## 18. `referral-settle` (admin) — 09 H8
> 라이더 추천 보상의 오프라인 지급 완료 마킹(해제 지원 — 오기록 정정). 원장 발행 없음(08 P5).
- 입력: `{ referralId, settle }`(`referralSettleInputSchema`). role=admin 필수.
- 처리: `fn_settle_referral_reward(referral_id, admin_id, settle)` — ACTIVATED 아니면 409
  `INVALID_TRANSITION`, 대상 없음 404 `NOT_FOUND`, 재정산/재해제는 멱등. referrals 쓰기는 RPC(service_role)에만.
- 출력: `{ referralId, settled, settledAt }`(`referralSettleOutputSchema`). v_referral_stats의
  `rider_reward_settled`/`rider_reward_unsettled`가 admin 정산 큐·rider 실적 표기에 쓰인다.

## 19. `directions` (인증 사용자) — 11 M9-b
> 출발→도착 도로 경로(폴리라인·거리·소요시간). 카카오모빌리티 Directions API 프록시 —
> REST 키는 서버 시크릿 `KAKAO_MOBILITY_KEY`로만 두고 클라이언트에 노출하지 않는다(CLAUDE.md 규칙 3).
- 입력: `{ origin: {lat,lng}, destination: {lat,lng} }`(`directionsInputSchema`). 인증만 요구(역할 무관).
- 처리: `KAKAO_MOBILITY_KEY` 미설정 시 `{ configured:false, path:[] }`로 조용히 비활성(에러 아님).
  설정 시 카카오모빌리티 호출 → vertexes 디코드. 상류 실패·길없음은 `path:[]`로 강등(200).
- 출력: `{ configured, distanceMeters, durationSeconds, path:[{lat,lng}] }`(`directionsOutputSchema`).
- 상태: **배선 완료·키 대기**. 지도 렌더 연결·실 키 응답 검증은 M9-b UI 작업(11 M9-b).

## 20. `dealer-create` (admin) — 13 I2
> 좌상(dealer) 계정 생성. role='dealer' 부여는 guard_profile_role상 service_role만 가능 → 이 Edge가 유일 경로.
- 입력: `{ username, password, displayName, phone }`(`dealerCreateInputSchema`). role=admin 필수.
- 처리: GoTrue 사용자 생성(email=`<username>@oilpick.local`, email_confirm) + profiles(role='dealer') insert.
  중복 아이디 409 `CONFLICT`. profiles 실패 시 방금 만든 auth 사용자 정리(고아 방지).
- 출력: `{ dealerId, username }`(`dealerCreateOutputSchema`).

## 21. `dealer-assign` (admin + 좌상) — 13 I2·D6
> rider_profiles.dealer_id 배정/해제. dealer_id는 guard_rider_verify상 service_role만 변경 → 이 Edge가 유일 경로.
- 입력: `{ riderId, dealerId | null }`(`dealerAssignInputSchema`). role=admin 또는 dealer.
- 처리: **admin** 임의 배정/해제(dealerId가 좌상 계정인지 검증). **dealer**는 미배정 라이더를 자기(self)
  로만 배정(이미 배정 시 409 `CONFLICT`)·자기 소속만 해제(아니면 403 `FORBIDDEN`). 라이더 없음 404 `NOT_FOUND`.
- 출력: `{ riderId, dealerId }`(`dealerAssignOutputSchema`).

## 11. `coupon-purchase-intent` (rider) — 07 F4·F14, [17 Q2] 복권
> ✅ **복권(17-coupon-revival.md C2·C3)** — 08 P1이 삭제했던 6종을 `a4b4fdd^` 원형으로 복원.
> DB(테이블·RPC·RLS)는 08에서도 보존돼 있었으므로 마이그레이션 없이 Edge·계약만 복귀.

쿠폰 구매 신청(PG 결제 진입 전 단계).
- 입력: `{ qty: number }` (1~200 정수)
- 처리: 최신 `coupon_price_ticks` 단가 스냅샷 → `coupon_purchases`(status='PENDING', unit_price 스냅샷,
  amount=qty×unit_price, pg_order_id 생성) insert. **pg_order_id는 `op`+18hex 20자 고정**(F14 개정 —
  코엠 응답 orderno 규격 Max 20, 토스 orderId 규칙과도 호환).
- 출력: `{ purchaseId, pgOrderId, amount, unitPrice, koem?, demo? }` — `PG_PROVIDER=koem`(**기본** —
  17 C3)이면 결제창 진입 정보 `koem: { payUrl, params }`를 동봉(F14). params는 SIMPLEPAY 가이드
  3.2.1 규격 전체(checkHash 포함)로 **서버가 생성**(API_KEY 필요)하며 클라이언트는 수정 없이
  hidden form POST만 한다. rUrl은 §12-1(기본 `${SUPABASE_URL}/functions/v1/coupon-purchase-return`,
  env `KOEM_RETURN_URL`로 재정의).
  `PG_PROVIDER=demo`면 `demo: true`를 동봉 — 클라이언트는 결제창 없이 §12 confirm 직행
  (**개발·데모 전용, 프로덕션 금지** — DEPLOY.md 경고).
- 검증 실패 400. 단가 tick 미설정 시 409 `COUPON_PRICE_NOT_SET` (07 §1-4 확정).

## 12. `coupon-purchase-confirm` (rider) — 07 F4 (토스·데모 전용), [17 Q2] 복권
토스 결제 승인 확정 + 쿠폰 충전(멱등 3중, 07 §1-4).
- 입력: `{ purchaseId, paymentKey, pgOrderId, amount }` (토스 successUrl 파라미터)
- 처리: `coupon_purchases` 행 **FOR UPDATE 잠금 → status=PENDING 재확인 → 시크릿 키로 토스 승인 API 호출 +
  amount 일치 검증 → 같은 트랜잭션(fn_confirm_purchase)에서 CHARGE + status=PAID·payment_key 기록**.
  성공 시 "쿠폰 N장 충전 완료" 알림 insert(**kind=`COUPON_CHARGED`** — 16 L2 알림 계층 등재, 17 신설).
- 멱등: 상태 전이 + `payment_key` unique + `coupon_ledger` unique(purchase_id, entry_type). **재호출 안전**(orphan 재시도).
- amount 위변조 시 거부(전이 없음). **PG 시크릿 키는 Edge Function 전용**.
- **코엠 모드(기본)에서는 미사용**(F14) — 어댑터 confirmPayment가 NOT_SUPPORTED로 거절되어 402
  `PAYMENT_FAILED`. 코엠 확정은 §12-1이 담당하고, 클라이언트는 PENDING 목록 재조회로 반영을 확인한다.
- **데모 모드**(F14 데모 운영): 어댑터가 요청 값을 그대로 성공으로 반환해 실 PG 없이 확정된다.
  paymentKey는 `demo_${purchaseId}` 관례 — 재시도 시 같은 키라 멱등 경로(PAID 조기 반환)를 탄다.
- 출력: `{ balance }` (충전 후 쿠폰 잔액)

## 12-1. `coupon-purchase-return` (공개 — 코엠 PG 서버 콜백) — 07 F14, [17 Q2] 복권
코엠 결제창 완료 후 PG가 rUrl로 결과를 form POST하는 수신점. **코엠의 유일한 승인 확정 경로**
(코엠은 서버 승인 API가 없는 결제창 리다이렉트형 — SIMPLEPAY 가이드 v1.14 §3.1.1).
- 인증: 없음(`verify_jwt=false`, supabase/config.toml) — PG 서버가 호출. 검증은 아래 대조로 수행.
- 입력: 결제응답 규격(가이드 §3.2.2) form-urlencoded — `result_code, tid, orderno, approvamt(표기
  편차 approamt 수용), reserved01(=purchaseId 이중화)` 사용.
- 처리: ① orderno(=pg_order_id)로 구매건 조회 → ② 이미 PAID면 멱등 성공 → ③ 실패 코드
  (EC9000 사용자취소 등)는 FAILED 전이 → ④ **approvamt == 서버 스냅샷 amount 검증**(불일치 시
  코엠 취소 시도 + FAILED) → ⑤ `fn_confirm_purchase`(PENDING→PAID + CHARGE, payment_key=tid) →
  ⑥ "쿠폰 N장 충전 완료" 알림(kind=`COUPON_CHARGED` — §12와 동일 카피·kind). RPC 실패(EXPIRED 등)는
  취소 시도 + FAILED.
- 출력: HTML(결제창 웹뷰 표시용) — 항상 200. `KOEM_RETURN_APP_URL`(앱 스킴) 설정 시 앱 복귀 시도.
- **보안 한계(확정 기록)**: 결제응답에 무결성 해시가 없다(가이드 §3.2.2 — checkHash는 요청 전용).
  방어: 서버 스냅샷 금액 대조 + 멱등 3중 + tid 저장(환불 시 PG 실검증으로 위조 tid 발각) +
  admin 일일 대사(판매 통계 ↔ 코엠 관리자페이지). 잔여 외부 액션: 코엠에 거래조회 API·
  응답 해시·Notification(가이드 §4) 발신 IP 목록 문의 — 확보 시 검증 강화(07 F14 잔여, 17 리스크).

## 13. `coupon-refund` (admin) — 07 F4, [17 Q2] 복권
쿠폰 구매 건 환불(구매 건 단위, 건당 1회 한정, 07 §1-4).
- 입력: `{ purchaseId, qty?, reason }` (qty 생략=전액, 지정=부분 1회)
- 처리: 금액=해당 건 unit_price 스냅샷 기준. **미사용 잔액(v_coupon_balance) ≥ 환불 qty 검증** →
  PG 취소 API(어댑터 경유) → 성공 시 `fn_refund_purchase` — **rider 단위 FOR UPDATE 직렬화 후 잔액
  재계산**(동시 수락 경합 방지) → 원장 `ADJUST(-qty, purchase_id 필수)` +
  `coupon_purchases.status=REFUNDED`(FOR UPDATE 상태 기반 멱등). rider "환급" 알림.
- 미사용 잔액 부족 시 409 `INSUFFICIENT_COUPON` 재사용 — 동일 의미(잔액 부족, 07 §1-4 확정).
  PG 취소 실패 시 원장 무변경 402 `PAYMENT_FAILED`.
- 코엠(F14): 취소는 `/api/cc/approv/cancel`(server-to-server JSON, checkHash=HMAC(tid+mid+cancel_amt)).
  **부분취소는 계약·카드에 따라 거부될 수 있다**(가이드 결과코드 EC1088 "부분 취소 불가") — 실패 시
  원장 무변경 402로 반환되므로 admin은 전액 환불로 재시도한다. 취소 API는 가맹점 공인 IP 방화벽
  등록이 선행 조건(DEPLOY.md 운영 노트).

## 14. `coupon-adjust` (admin) — 07 F3b-⑤, [17 Q2] 복권
쿠폰 수동 조정(CS 보조 / 데모 라이더 선지급. point-adjust 패턴 복제).
- 입력: `{ riderId, qty: number, memo: string }` (memo 필수, qty ±)
- 처리: `fn_charge_coupon(ADJUST, ±qty, purchase_id=null, memo, created_by=admin)`.
  음수 조정이 잔액을 초과하면 RPC raise → 409 `INSUFFICIENT_COUPON`.

## 15. `coupon-price-set` (admin) — 07 F3b-⑤, [17 Q2] 복권
쿠폰 단가 tick 등록(price-set 패턴 복제 — 17 C2, 관리자 지정 단가).
- 입력: `{ unitPrice: number }` (>0) → `coupon_price_ticks` insert.
- 구매 시점 최신 tick이 `coupon_purchases.unit_price`로 스냅샷 — 이후 변동 무영향(시세 스냅샷 원칙).

## 22. `confirm-remind` (rider) — 16 L5
- 입력: `{ orderId }` (core `confirmRemindInputSchema`). 출력: `{ sent: boolean }` —
  `sent:false`는 rate limit 스킵(에러 아님, 클라 카피 분기).
- 처리: 본인 배정(rider_id=auth.uid()) + ARRIVED + measured_kg not null 검증 후 supplier에게
  최초 SUBMIT_MEASURE와 **동일 카피**(`_shared/orderNotify.submitMeasureNotification` — 14 J4 순액
  기준)를 재발송. rate limit **주문당 2시간 1회**는 `sendPushDeduped`(kind=CONFIRM_REMIND_MANUAL,
  link=/orders/:id)가 서버 강제 — 클라 버튼 비활성은 보조.
- **pickup_orders를 일절 update하지 않는다**(16 §0-1 — 순수 알림. 교착 해소는 여전히 supplier
  CONFIRM_MEASURE / admin FORCE_COMPLETE 전용).
- 에러: NOT_FOUND(주문 없음) / FORBIDDEN(타인 주문) / INVALID_TRANSITION(확인 대기 상태 아님).

## 22-2. `payout-change-request` (supplier) — 08 P2 확장(2026-08-05, CEO 지시)
- 입력: `{ orderId }` (core `payoutChangeRequestInputSchema`). 출력: `{ sent: boolean }` —
  `sent:false`는 rate limit 스킵(에러 아님, 클라 카피 분기). confirm-remind(§22)의 미러다.
- 처리: 본인 주문(supplier_id=auth.uid()) + ARRIVED + measured_kg not null +
  **payout_method='POINT'** 검증 후 배정 라이더에게 "현금 지급 변경 요청" 푸시
  (kind=PAYOUT_CHANGE_REQUEST, link=/active). rate limit **주문당 2시간 1회**는
  `sendPushDeduped`가 서버 강제.
- **pickup_orders를 일절 update하지 않는다** — 실제 수단 변경은 여전히 라이더 재제출
  (SUBMIT_MEASURE, final_kg 고정 전)로만 일어난다(08 P2 2자 확인 원칙 유지).
- 에러: NOT_FOUND(주문 없음) / FORBIDDEN(타인 주문) / INVALID_TRANSITION(확인 대기 아님
  ·배정 라이더 없음·POINT 제출 주문 아님).

## 23. `settlement-watch` (cron, 15분 권고) — 16 L8
- 입력 없음(POST, admin/service_role 인증 — order-expire와 동일). 출력: `{ band80Alerts, thresholdAlerts }`.
- 처리: `v_dealer_statement` 전 좌상 스캔(service_role — invoker 뷰지만 RLS 우회) →
  ① usage/credit_limit **≥ 80%** 밴드 ② **over_threshold** 진입 시 좌상 본인(link=/statement) +
  admin 전원(link=/dealer-settlement?dealer=<id> — 좌상별 dedupe 키 분리)에게 푸시.
  판정은 `_shared/creditWatch.dueCreditAlerts` 순수 함수(deno test), 재발화 억제는
  `sendPushDeduped` kind별 **24h 윈도**. 한도 0(미설정)은 밴드 판정 제외.
- **자동청구 없음**(14 §4 확정 불변) — 청구 생성·정산·무효는 계속 admin 수동. 상태·원장 무접촉.
- cron 배선은 배포 설정(DEPLOY.md §1-4) — 미배선 시 curl 수동 검증 절차 동봉.
- **dealer-claim 개정**: create/settle/void 성공 시 좌상에게 청구 라이프사이클 통지
  (kind=CLAIM_CREATED/SETTLED/VOIDED, link=/statement) — 실패는 응답을 막지 않음(격리).

## 푸시 발송 헬퍼 `_shared/push.ts`
- `sendPush(userIds[], title, body, link)`: profiles.fcm_token 조회 → FCM HTTP v1 멀티캐스트
  + notifications insert. 토큰 만료(UNREGISTERED) 시 fcm_token null 처리.
- FCM 서비스 계정 키는 Supabase secrets `FCM_SERVICE_ACCOUNT`.

## 14 신유·상계·좌상 정산 엔드포인트 (J-태스크, 14-fresh-oil-settlement.md 단일 진실)

- **order-create** 확장: 입력 += `purchaseCans?`(신유 구매 통수 1..50). `requestedKg`는 0 허용(구매-only).
  구매 동반 시 최신 `fresh_oil_price_ticks` 스냅샷(부재 404) + `order_kind`(PICKUP/PURCHASE/MIXED) 판정.
- **order-transition / SUBMIT_MEASURE** payload += `deliveredCans?`(구매 동반 필수 0..50), `barcodes?`, `geo?`,
  `barcodeItems?`(**[O2 2026-08-05]** `[{ code, photoUrl? }]` ≤50 — 바코드 사진 첨부. RPC는 barcodeItems가
  있으면 그것으로 pickup_items replace-set(**photo_url 포함**, barcodes보다 우선), 없으면 레거시 `barcodes`
  경로 폴백. 사진 단독 등록은 클라이언트가 `photo-` 접두 고유 코드 생성 — 14 §2-3 O2 확장이 단일 진실).
  넷팅·게이트는 `fn_settle_trade`(CONFIRM_MEASURE/FORCE_COMPLETE). 부족/한도초과 시 INSUFFICIENT_BALANCE/
  DEALER_LIMIT_EXCEEDED(롤백) — **둘 다 409로 매핑**(`mapTransitionError`, 14 J4). 매핑이 없으면 폴백
  INVALID_TRANSITION으로 뭉개져 점주가 원인도 복구 경로("현금으로 재제출")도 알 수 없다.
  `DEALER_LIMIT_EXCEEDED`는 packages/core `ERROR_CODES`/`ERROR_MESSAGE_KO`에 등록돼 있다.
- **order-transition / RESOLVE_DISPUTE** payload += `finalCans?`(0..50, 선택 — 14 J4).
  구매 동반 주문의 배달 통수를 중재에서 정정한다. 없으면 `delivered_cans` 유지. 중재 후에는
  SUBMIT_MEASURE가 `final_kg` 가드에 막히므로 통수를 고칠 수 있는 **유일한 지점**이다.
- **알림 금액은 `net_amount`(상계 순액) 기준**(14 J4). `cash_paid_amount`는 폐유 총액으로 동결돼 있어
  구매 동반 주문에서 금액이 다르고 net&lt;0이면 부호까지 반대다. 원장이 net으로 발행되므로 통지도 net을 따른다.
- **geocode**(신규, 12 S2 재설계): `{ address }` → `{ configured, point: {lat,lng} | null }`.
  VWorld Geocoder를 **서버측에서 프록시**한다. 브라우저 직접 호출은 VWorld가 CORS 헤더를 주지 않아
  `No 'Access-Control-Allow-Origin'`으로 전부 차단되고, 인증키가 클라이언트 번들에 노출된다(규칙 3).
  키는 서버 시크릿 `VWORLD_KEY`. 미설정 시 200 + `configured:false`로 조용히 비활성(호출부는 수동
  좌표 입력으로 강등). 인증만 요구(역할 무관 — 점주가 매장 주소를 등록한다). directions와 동일 패턴.
- **price-set** 분기: `kind='FRESH'`면 `{ pricePerCan }` → fresh_oil_price_ticks. 미지정=폐유 시세(기존).
- **dealer-account-set**(admin): `{ dealerId, depositAmount, creditLimit, claimThreshold, feeRateBp }` →
  fn_set_dealer_account upsert.
- **dealer-claim**(admin): `{ action:'create', dealerId }` / `{ action:'settle'|'void', settlementId }` →
  fn_create/settle/void_dealer_claim. create=미정산 주문 집계·스탬핑, void=스탬프 해제(풀 복귀).
- 조회 뷰: `v_dealer_statement`(usage/limit/headroom/over_threshold), `v_dealer_settlement_orders`(청구 상세/CSV).
  RLS: 좌상 본인 + admin.

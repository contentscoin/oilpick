# 00. 도메인 스펙 (단일 진실)

> **[08 피벗]** 이 문서는 08-payout-pivot.md §0~1에 확정된 **현장 지급수단(현금·포인트) 신모델**을
> 반영한다. 07의 수거쿠폰 모델(라이더 사전 구매·소진 게이트)은 삭제하지 않고 **레거시**로 강등해
> 보존한다(전환기 잔존 주문 완결·회계 감사용). 신규 설계 판단은 08이 단일 진실.

## 용어 (코드 네이밍 고정)
| 한글 | 코드 | 설명 |
|---|---|---|
| 사용자(공급업체) | `supplier` | 폐식용유 배출·판매하는 매장. 현장에서 **현금 또는 포인트**로 매각대금 수령 |
| 라이더(수거업체) | `rider` | 콜 수락(무비용) → 현장 계량 → **지급수단 선택(현금/포인트)** → 매입 → 허가 재활용업체(인계처) 인계 |
| 회사(관리자) | `admin` | 시세 결정, 라이더 관리(승인/정지), 출금 처리, 포인트·지급 통계, CS |
| 수거 주문 | `pickup_order` | 수거 요청 1건 |
| 시세 | `price_tick` | 매입가 (원/kg) |
| 지급수단 | `payout_method` (`'CASH'\|'POINT'`) | 라이더가 계량 제출 시 선택하는 현장 지급수단. `pickup_orders.payout_method` |
| 확정 지급액 | `cash_paid_amount` | 완료 시 확정된 지급액(원). **POINT 지급이어도 이 컬럼에 기록**(1P=1원, 컬럼명은 레거시 보존 — 08 P3) |
| 포인트 | `point` (`point_ledger`) | **현역 복권(08 P3·P4)** — 1P = 1원. 정수. POINT 지급수단의 적립·출금 수단 |
| 출금 | `withdrawal` (`withdrawals`) | supplier가 포인트 잔액을 현금화하는 신청. 최소 10,000P, admin 처리 |
| 인계처 | `recycler` (`recycler_name`/`recycler_contact`) | 라이더가 수거한 기름을 매각·인계하는 허가 재활용업체 (승인 조건, 07 F11) |
| 수거쿠폰 | `coupon` (`coupon_ledger`) | **레거시(신규 발행 중지, 08 P1)** — 07 모델의 콜 배정 수수료 수단. 테이블·과거 데이터 보존 |
| 쿠폰 단가 | `coupon_unit_price` | **레거시(08 P1)** — coupon_price_ticks 보존, 신규 tick 없음 |
| 수거비 | `rider_fee` | **레거시(07에서 소멸)** — 신규 미기록 |
| 집하장 | `depot` | **레거시(07에서 소멸)** — 구모델 지정 배송지 |

## 주문 상태머신

상태: `REQUESTED → ACCEPTED → ARRIVED → COMPLETED`
예외: `CANCELLED`, `DISPUTED`
레거시 잔존 상태: `PICKED_UP`, `DELIVERED` (신규 주문 도달 불가 — 아래 "레거시 주문 전용 전이" 참조. enum 값은 삭제 금지)

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| (생성)→REQUESTED | supplier | 진행중 주문 3건 미만 | 시세 스냅샷 저장(절대 규칙 5), 매칭 브로드캐스트 시작. **coupon_cost 스냅샷 중지(항상 null — 08 P1)** |
| REQUESTED→ACCEPTED | rider | 라이더 verified(`APPROVED`) & online & 진행중 주문 없음. **선착순 1명**(조건부 `UPDATE ... WHERE status='REQUESTED'` 락). **쿠폰 가드 소멸(08 P1)** — 잔존 쿠폰 주문(coupon_cost not null)만 레거시 CONSUME 분기 통과 | supplier 푸시 "라이더 배정" |
| ACCEPTED→ARRIVED | rider(배정 본인) | — | supplier 푸시 "도착" |
| ARRIVED (SUBMIT_MEASURE) | rider(배정 본인) | 계량값(kg) + 현장 사진 ≥1장 + **지급수단(`payoutMethod: 'CASH'\|'POINT'`) 필수(08 P2)**. 중재 완료(final_kg not null) 주문 재제출 불가 | measured_kg/photo_urls/**payout_method** 저장(상태 유지 ARRIVED). 앱 표시: CASH "지급할 현금 = kg×스냅샷시세" / POINT "적립될 포인트". supplier 푸시(수단별 카피, §알림). 재제출로 수단 변경 가능(final_kg 고정 전) |
| ARRIVED→COMPLETED | supplier 본인 (CONFIRM_MEASURE) | 계량 제출됨 | **"무게 확인 + 지급 확인"(2자 확인)**. `final_kg` 확정, `cash_paid_amount = round(final_kg × snapshot_price_per_kg)`, `completed_at = now()`. **`payout_method='POINT'`면 같은 트랜잭션에서 `fn_post_ledger(supplier,'EARN',금액,order_id)` 발행(08 P3)** — null은 CASH 간주(coalesce). rider 푸시(수단별), POINT면 supplier 적립 푸시 |
| ARRIVED→DISPUTED | supplier 본인 | 지급 전 계량 이의(사유 텍스트 필수) | admin 알림 |
| DISPUTED→ARRIVED | admin (RESOLVE_DISPUTE) | — | 중재는 kg 확정까지만 — `final_kg` 고정(이후 SUBMIT_MEASURE 재제출 불가). 지급·수령 확인이 남아 **ARRIVED 복귀** → 일반 CONFIRM_MEASURE 경로로 완료. 양쪽 알림 "확정 무게 O.Okg" |
| ARRIVED→COMPLETED | admin (FORCE_COMPLETE) | 계량 제출/중재 kg 존재 + memo(사유) 필수 | CONFIRM_MEASURE와 동일 지급 로직(**POINT면 EARN 발행**) + order_events 기록. 점주 수령 확인 교착 해소용. 양쪽 알림 |
| REQUESTED→CANCELLED | supplier 자진 또는 시스템 30분 무수락 | 수락 전 언제나 / 30분 무수락 자동(NO_RIDER) | supplier 푸시 |
| {ACCEPTED\|ARRIVED\|DISPUTED}→CANCELLED | admin 전용 | **fault 파라미터 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'` — 감사 기록, 07 D4·D6 승계) | 양쪽 통지. **쿠폰 환급 분기는 레거시 주문(CONSUME 존재·qty 일치) 전용으로 잔존** — 신규 주문(coupon_cost null) 무영향 |

- 현금 지급 증빙 = 계량 사진 + 점주 앱 CONFIRM(금액 명시 승인) **2자 확인**.
  포인트 지급 증빙 = CONFIRM과 원자 발행되는 EARN 원장 행(구조적으로 분쟁 여지 제거).
  지급 후 분쟁은 상태머신이 아닌 **CS(cs_tickets, category=CASH_DISPUTE)** 영역.
- ARRIVED 24시간 초과 체류 주문은 admin OrdersPage에서 하이라이트(교착 조기 감지).
- 모든 전이는 `order_events`에 (order_id, from, to, actor_id, payload jsonb) append.
- 잘못된 전이 요청은 409 에러. 상태머신 검증 함수는 `packages/core/src/orderMachine.ts`에 순수 함수로
  구현하고 Edge Function과 클라이언트 UI(버튼 노출)가 공유한다. 레거시 전이(PICKED_UP/DELIVERED 경로)는
  별도 함수로 분리 유지.

### 레거시 주문 전용 전이 (신규 주문 도달 불가 — 잔존분 완결용)
이미 PICKED_UP에 도달한 잔존 주문만 아래 구모델 경로로 완결한다. enum 값(PICKED_UP/DELIVERED 등)은
절대 삭제하지 않는다. 레거시 완결(DELIVER)은 point_ledger를 변경하지 않는다(07 D1 보강 유지 —
배송 완료는 어떤 경우에도 라이더 지급 이벤트가 아니다).

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| PICKED_UP→DELIVERED | rider | 집하장 QR 코드 스캔 검증 (depot.qr_secret 일치) | 지급 없음 — 완결 전이만 수행 |
| DELIVERED→COMPLETED | 시스템 | DELIVERED 즉시 자동 | — |

## 매칭 규칙
1. REQUESTED 시 매장 위치 반경 **3km** 내 `online & verified & 진행중 주문 없음` 라이더 전원에게 푸시.
2. 5분 무수락 → 반경 **7km** 재브로드캐스트. 다시 5분 → **15km**. 30분 무수락 → 자동 CANCELLED
   (사유: `NO_RIDER`) + supplier에게 안내 푸시 + admin 알림.
3. 수락은 선착순. 두 번째 이후 수락 시도는 409 `ALREADY_ACCEPTED`.

## 포인트 원장 규칙 (현역 — 08 P3·P4로 복권)
> 07 D1의 "신규 발행 전면 중지"를 해제한다. POINT 지급수단의 적립(EARN)과 출금
> (WITHDRAW_REQUEST/WITHDRAW_CANCEL), admin 수동 조정(ADJUST)이 현역 발행 경로다.
> 발행은 여전히 **service_role RPC에만 존재**(절대 규칙 1).

- `point_ledger`는 **append-only**. UPDATE/DELETE 금지 (트리거로 차단).
- **현역 entry_type**:
  - `EARN`(supplier 매각대금 적립) — POINT 지급수단 주문의 완료 전이에서 fn_post_ledger로 발행.
    멱등 `unique(order_id, entry_type, user_id)` — 주문 1건당 EARN 정확히 1행.
  - `WITHDRAW_REQUEST`(출금 신청 시 -amount 즉시 차감) / `WITHDRAW_CANCEL`(반려 시 +amount 복구)
    — withdrawal_id로 멱등.
  - `ADJUST`(admin 수동 ± — point-adjust Edge Function, memo 필수).
  - `REFERRAL`(supplier 추천 보너스 적립, +부호·출금 가능 = EARN과 동일 취급) — 추천 점주의 첫 수거
    완료(활성화) 시 `fn_activate_referral` → `fn_post_ledger(supplier,'REFERRAL',보너스,order_id)`로 발행.
    멱등 `unique(order_id, entry_type, user_id)`. service_role 전용(09 H5, 아래 "라이더 추천" 절).
- **레거시 전용 entry_type(신규 발행 없음)**: `HOLD`/`RELEASE`(구모델 수거비 — 잔존 HOLD는 held
  표시로만 남는 과거 회계 기록, 지급 의무 아님), `PURCHASE`(쇼핑몰, 미래 예약).
- 부호 규칙: 잔액 증가 = 양수, 감소 = 음수. HOLD는 `held` 컬럼 별도 집계 (잔액 미포함).
- 출금: 최소 **10,000P**(`MIN_WITHDRAW`). 신청 = `fn_request_withdraw`(user 단위 FOR UPDATE 직렬화
  → 잔액 재계산 → WITHDRAW_REQUEST(-) + withdrawals insert 원자 처리, 부족 시 INSUFFICIENT_BALANCE).
  처리 = `fn_process_withdraw`(REQUESTED→APPROVED→PAID / REQUESTED→REJECTED+WITHDRAW_CANCEL 복구).
- 잔액 조회는 `v_point_balance` 뷰만 사용 (user_id, available, held).
- 불변식(테스트로 검증): POINT 완료 주문 1건당 EARN 1행(재시도 멱등), CASH 완료 주문은
  point_ledger 무변경, 출금 신청→반려 왕복 후 잔액 원복, 레거시 DELIVER는 원장 무변경.

## 쿠폰 원장 규칙 (레거시 — 신규 발행 중지, 08 P1)
> 08 피벗으로 쿠폰 모델이 폐기됐다. order-create가 coupon_cost 스냅샷을 중지해(신규 주문 null)
> ACCEPT의 CONSUME 분기가 자연 소멸했고, coupon-* Edge Function 6종은 코드 삭제+undeploy됐다.
> **전환기 잔존 주문(coupon_cost not null)의 CONSUME/REFUND 분기만 fn_transition_order에 보존**된다.
> coupon_ledger/coupon_purchases/coupon_price_ticks 테이블·뷰·DB RPC(fn_charge_coupon/
> fn_consume_coupon/fn_confirm_purchase/fn_refund_purchase)·과거 데이터는 append-only 회계 기록으로
> 보존(삭제 금지). 3중 무결성(append-only 트리거·멱등 unique 2종·security_invoker 뷰+RLS)도 유지.
> 아래 07 규칙(소진량 공식·단가·구매·환불)은 과거 데이터 감사 목적으로만 유효하다 — 07-pivot-plan.md §1 참조.

## 라이더 추천 (레퍼럴) 규칙 (09 H — 단일 진실: docs/spec/09-referral.md)
> 라이더(referrer)가 점주(referred)에게 앱 설치를 영업하는 성장 루프. 08 위에 순수 추가(상태머신·원장 규칙 승계).
- **추천코드**: `rider_profiles.referral_code`(unique, Crockford base32 8자, Edge `referral-code`가 없으면 생성).
  공유 링크는 Edge(referral-code)가 `${REFERRAL_BASE_URL}/ref/<CODE>`로 조립해 반환(REFERRAL_BASE_URL은
  Supabase 시크릿, 미설정 시 core 상수 `REFERRAL_LINK_BASE`=`https://app.oilpick.kr`). 딥링크 `oilpick-user://ref/<code>`.
- **연결(attach)**: 점주 가입 직후 저장된 코드로 `referral-attach`(best-effort, 비차단). `fn_attach_referral`이
  APPROVED 라이더 코드만 유효(아니면 INVALID_REFERRAL_CODE), **점주 1인 1회**(referred_supplier_id unique,
  선착순 최초 확정·멱등), 자기추천 차단. 보너스 금액은 core 상수 스냅샷(가입 시점, 이후 상수 변경 무영향).
- **활성화**: 추천 점주의 **첫 수거 완료**(COMPLETED 도달) 시 order-transition Edge가 `fn_activate_referral`
  호출 → referrals `SIGNED_UP→ACTIVATED` + 점주 `REFERRAL` 보너스 발행. 멱등 no-op(추천 없음/이미 활성).
- **보상 구조**: 점주 = `point_ledger REFERRAL(+REFERRAL_SUPPLIER_BONUS=5000)`(출금 가능). 라이더 =
  `referrals.rider_reward(REFERRAL_RIDER_REWARD=3000)` 스냅샷 — **라이더 지갑 없음(08 P5)**, admin 통계·
  오프라인 정산 청구 근거로만 기록.
- **통계**: `v_referral_stats`(라이더별 가입/활성화/전환/보너스/보상, RLS 본인 1행·admin 전체),
  `v_referral_daily`(admin 게이트 — 일별 추이). 쓰기는 service_role RPC에만(절대 규칙 1 확장).
- 불변식(테스트로 검증): 오코드·미승인 라이더 코드 거부, 점주 1인 1회(재-attach 멱등), 활성화 1회당 REFERRAL 1행
  (재활성화 no-op), 추천 없는 점주 활성화 no-op, 통계 뷰 집계.

## 시세 규칙
- admin이 (원/kg 매입가) 설정 → `price_ticks` insert (effective_at now).
- 현재 시세 = effective_at 최신 1건.
- 스냅샷은 주문 생성 시 최신 tick에서(절대 규칙 5). 이후 시세 변동 무영향.

### 시세 일별 차트 규칙
- 하루 대표값 = **그날 마지막 tick(종가)**. tick 없는 날 = **직전값 캐리포워드**(평평한 선).
- 구현은 클라이언트 리샘플(`packages/core resampleDaily`) — DB 뷰 불필요.
- "전일 대비" 등락은 **일별 종가[n-1] 기준**으로 산정(직전 tick 대비 아님).
- 운영 룰: admin은 **영업일 최소 1회 시세 tick 등록**(차트 품질의 전제).
- **PriceChart v2(08 §1-4)**: 기간 통계(최고/최저/평균) 표면화, 최고·최저 마커, 소극 스무딩,
  마지막 값 펄스, y축 가이드, 스크럽 툴팁 전일 대비 병기. 순수 SVG(라이브러리 금지), reduced-motion 존중.

## 계량/수량 규칙
- supplier 요청 시 입력: **통 수 × 통 크기(18L 말통/10L)** 또는 **kg 직접 입력**(08 P6).
  예상 kg = `estimateKg(cans, canSizeL)` — 18L 통 = 15kg(`KG_PER_CAN`), 10L = 비례 환산(≈8.3kg).
- 예상 지급액 = 예상 kg × 시세 (UI 표시용, "현장 계량 기준으로 확정" 문구 필수).
- 확정 지급액 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림 (`cash_paid_amount` — POINT 지급도
  이 컬럼에 기록, 1P=1원).
- 지급수단(현금/포인트)은 라이더가 계량 제출 시 선택(`payout_method`) — 08 P2.

## 라이더 인증
- 가입 시 서류 3종 업로드(사업자등록증, 차량 사진, **폐기물처리(수집·운반) 신고증명서 — 필수**, 07 F11)
  + 인계처(허가 재활용업체) 업체명·연락처 필수. 신고증명서·인계처 없이는 admin 승인이 서버에서 거부된다.
- rider_profiles.verify_status: `PENDING → APPROVED | REJECTED`, `SUSPENDED`(정지).
- APPROVED 전에는 콜 목록 조회/수락 불가 (RLS + API 가드 + RPC 게이트). SUSPENDED도 동일 차단.
- 인증 QR: rider_id + 발급시각 서명 토큰(JWT, 5분 만료)을 R9 화면에 표시.

## 알림 매트릭스 (08 §1-5 — 07 표 전면 교체, 푸시 + notifications 테이블 기록)
| 이벤트 | 수신자 | 카피(요지) |
|---|---|---|
| SUBMIT_MEASURE (CASH) | supplier | "계량 결과가 도착했어요 — 무게·현금 ₩N을 확인해 주세요" |
| SUBMIT_MEASURE (POINT) | supplier | "계량 결과가 도착했어요 — 확인하시면 포인트 N P가 적립돼요" |
| CONFIRM_MEASURE (CASH) | rider | "수거 완료 — 현금 ₩N 지급이 확인됐어요" |
| CONFIRM_MEASURE (POINT) | rider | "수거 완료 — 포인트 N P 지급이 확인됐어요" |
| CONFIRM_MEASURE (POINT) | supplier | "포인트 N P가 적립됐어요 — 지갑에서 출금 신청할 수 있어요" |
| FORCE_COMPLETE | supplier+rider | "관리자 확인으로 주문이 완료 처리됐어요" (POINT면 supplier 적립 카피 병기) |
| RESOLVE_DISPUTE | supplier+rider | "이의신청 중재 결과: 확정 무게 O.Okg" |
| CANCEL(admin, fault 기록) | rider+supplier | 취소 통지 (쿠폰 환급 카피는 레거시 주문에서만) |
| 출금 승인/지급/반려 | supplier | "출금 신청이 승인되었어요" / "출금이 완료되었어요" / "출금 신청이 반려되어 포인트가 복구되었어요" |
| 정지/해제(07 F11) | rider | 정지 사유/해제 통지 |
| 인증 승인/반려 | rider | 검수 결과 통지 |

기존 유지: 콜 도착 브로드캐스트(반경 내 rider), 수락됨(supplier), 도착(supplier), 30분 무수락
취소(supplier+admin) 기본 통지. 삭제: 쿠폰 충전 성공(대상 플로우 소멸).

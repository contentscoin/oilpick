# 00. 도메인 스펙 (단일 진실)

> **[08 피벗]** 이 문서는 08-payout-pivot.md §0~1에 확정된 **현장 지급수단(현금·포인트) 신모델**을
> 반영한다. 신규 설계 판단은 08이 단일 진실.
> **[17 쿠폰 복권]** 08 P1이 레거시로 강등했던 수거쿠폰(라이더 사전 구매·콜 수락 게이트)은
> 17-coupon-revival.md(CEO 2026-08-05)로 **현역 복권**됐다 — 쿠폰은 "콜을 받을 권리"이며 08의
> 지급수단(현금/포인트) 축과 독립(17 C7). 쿠폰 설계 판단은 17이 단일 진실.

## 용어 (코드 네이밍 고정)
| 한글 | 코드 | 설명 |
|---|---|---|
| 사용자(공급업체) | `supplier` | 폐식용유 배출·판매하는 매장. 현장에서 **현금 또는 포인트**로 매각대금 수령 |
| 라이더(수거업체) | `rider` | 콜 수락(**[17 복권] 수거쿠폰 소진 — 1통당 1장**) → 현장 계량 → **지급수단 선택(현금/포인트)** → 매입 → 허가 재활용업체(인계처) 인계 |
| 회사(관리자) | `admin` | 시세 결정, 라이더 관리(승인/정지), 출금 처리, 포인트·지급 통계, CS |
| 수거 주문 | `pickup_order` | 수거 요청 1건 |
| 시세 | `price_tick` | 매입가 (원/kg) |
| 지급수단 | `payout_method` (`'CASH'\|'POINT'`) | 라이더가 계량 제출 시 선택하는 현장 지급수단. `pickup_orders.payout_method` |
| 확정 지급액 | `cash_paid_amount` | 완료 시 확정된 지급액(원). **POINT 지급이어도 이 컬럼에 기록**(1P=1원, 컬럼명은 레거시 보존 — 08 P3) |
| 포인트 | `point` (`point_ledger`) | **현역 복권(08 P3·P4)** — 1P = 1원. 정수. POINT 지급수단의 적립·출금 수단 |
| 출금 | `withdrawal` (`withdrawals`) | supplier가 포인트 잔액을 현금화하는 신청. 최소 10,000P, admin 처리 |
| 인계처 | `recycler` (`recycler_name`/`recycler_contact`) | 라이더가 수거한 기름을 매각·인계하는 허가 재활용업체 (승인 조건, 07 F11) |
| 수거쿠폰 | `coupon` (`coupon_ledger`) | **현역 복권([17])** — 라이더가 사전 구매해 콜 수락 시 기름 1통(15kg)당 1장 소진하는 콜 배정 수수료 수단. 플랫폼 수익 모델(17 §0) |
| 쿠폰 단가 | `coupon_unit_price` | **현역 복권([17] C2)** — 관리자 지정(coupon_price_ticks, coupon-price-set). 구매 시점 스냅샷 |
| 수거비 | `rider_fee` | **레거시(07에서 소멸)** — 신규 미기록 |
| 집하장 | `depot` | **레거시(07에서 소멸)** — 구모델 지정 배송지 |

## 주문 상태머신

상태: `REQUESTED → ACCEPTED → ARRIVED → COMPLETED`
예외: `CANCELLED`, `DISPUTED`
레거시 잔존 상태: `PICKED_UP`, `DELIVERED` (신규 주문 도달 불가 — 아래 "레거시 주문 전용 전이" 참조. enum 값은 삭제 금지)

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| (생성)→REQUESTED | supplier | 진행중 주문 3건 미만 | 시세 스냅샷 저장(절대 규칙 5), **coupon_cost = ceil(requested_kg/15) 스냅샷([17 복권] — 0이면 null)**, 매칭 브로드캐스트 시작 |
| REQUESTED→ACCEPTED | rider | 라이더 verified(`APPROVED`) & online & 활성 주문 3건 미만(MAX_RIDER_ACTIVE_ORDERS). **선착순 1명**(조건부 `UPDATE ... WHERE status='REQUESTED'` 락). **쿠폰 수락 게이트([17 복권])** — coupon_cost not null이면 같은 트랜잭션에서 fn_consume_coupon(CONSUME, -coupon_cost), 잔액 부족 시 `INSUFFICIENT_COUPON` 409로 전체 롤백(주문 REQUESTED 잔존) | supplier 푸시 "라이더 배정" |
| ACCEPTED→ARRIVED | rider(배정 본인) | — | supplier 푸시 "도착" |
| ARRIVED (SUBMIT_MEASURE) | rider(배정 본인) | 계량값(kg) + 현장 사진 ≥1장 + **지급수단(`payoutMethod: 'CASH'\|'POINT'`) 필수(08 P2)**. 중재 완료(final_kg not null) 주문 재제출 불가 | measured_kg/photo_urls/**payout_method** 저장(상태 유지 ARRIVED). 앱 표시: CASH "지급할 현금 = kg×스냅샷시세" / POINT "적립될 포인트". supplier 푸시(수단별 카피, §알림). 재제출로 수단 변경 가능(final_kg 고정 전) |
| ARRIVED→COMPLETED | supplier 본인 (CONFIRM_MEASURE) | 계량 제출됨 | **"무게 확인 + 지급 확인"(2자 확인)**. `final_kg` 확정, `cash_paid_amount = round(final_kg × snapshot_price_per_kg)`, `completed_at = now()`. **`payout_method='POINT'`면 같은 트랜잭션에서 `fn_post_ledger(supplier,'EARN',금액,order_id)` 발행(08 P3)** — null은 CASH 간주(coalesce). rider 푸시(수단별), POINT면 supplier 적립 푸시 |
| ARRIVED→DISPUTED | supplier 본인 | 지급 전 계량 이의(사유 텍스트 필수) | admin 알림 |
| DISPUTED→ARRIVED | admin (RESOLVE_DISPUTE) | — | 중재는 kg 확정까지만 — `final_kg` 고정(이후 SUBMIT_MEASURE 재제출 불가). 지급·수령 확인이 남아 **ARRIVED 복귀** → 일반 CONFIRM_MEASURE 경로로 완료. 양쪽 알림 "확정 무게 O.Okg" |
| ARRIVED→COMPLETED | admin (FORCE_COMPLETE) | 계량 제출/중재 kg 존재 + memo(사유) 필수 | CONFIRM_MEASURE와 동일 지급 로직(**POINT면 EARN 발행**) + order_events 기록. 점주 수령 확인 교착 해소용. 양쪽 알림 |
| REQUESTED→CANCELLED | supplier 자진 또는 시스템 30분 무수락 | 수락 전 언제나 / 30분 무수락 자동(NO_RIDER) | supplier 푸시 |
| {ACCEPTED\|ARRIVED\|DISPUTED}→CANCELLED | admin 전용 | **fault 파라미터 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'` — 감사 기록, 07 D4·D6 승계) | 양쪽 통지. **[17 복권] SUPPLIER/SYSTEM 귀책이면 쿠폰 REFUND(+coupon_cost)** — 동일 order_id+rider_id CONSUME 존재·qty 일치 시(없으면 skip). RIDER 귀책은 환급 없음 |

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
1. REQUESTED 시 매장 위치 반경 **3km** 내 `online & verified & 활성 주문 3건 미만(MAX_RIDER_ACTIVE_ORDERS)` 라이더 전원에게 푸시.
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

## 쿠폰 원장 규칙 ([17 복권] 현역 — 07 §1-1, 절대 규칙 1의 확장)
> **[17 복권]** 08 P1이 "레거시 — 신규 발행 중지"로 강등했던 이 절을 17-coupon-revival.md가
> 현역으로 복권했다(C4 — 기존 규칙 그대로). order-create가 coupon_cost 스냅샷을 재개해 ACCEPT의
> CONSUME 게이트가 RPC 무변경으로 부활했고, coupon-* Edge Function 6종은 `a4b4fdd^` 원형으로
> 복원됐다(02-api.md §11~15). DB(테이블·뷰·RPC·RLS)는 08에서도 전부 보존돼 있었다 — 마이그레이션 없음.

- **쿠폰은 클라이언트에서 절대 쓰지 않는다.** `coupon_ledger` insert는 service_role RPC(`fn_charge_coupon`/`fn_consume_coupon`/`fn_confirm_purchase`/`fn_refund_purchase`)에만 존재. 잔액은 `v_coupon_balance` 뷰로만 조회. `rider_profiles`에 잔액 컬럼 금지(원장+뷰 분리).
- point_ledger의 **3중 무결성 패턴**을 그대로 미러링:
  ① append-only 강제 트리거(`forbid_coupon_mutation` — UPDATE/DELETE 무조건 예외, service_role도 불가).
  ② 멱등 unique 2종 — `unique(order_id, entry_type, rider_id)`(CONSUME/REFUND 재시도 안전) + 부분 유니크 `unique(purchase_id, entry_type) where purchase_id is not null`(CHARGE/PG환불 멱등).
    **주의: Postgres NULLS DISTINCT 때문에 order_id가 NULL인 행(CHARGE/ADJUST)은 첫 번째 unique의 적용 대상이 아니다**(중복 삽입 허용 — 다중 충전에 필요한 의도된 동작). CHARGE 멱등은 두 번째 unique와 `coupon_purchases` 상태 전이가 담당.
  ③ `security_invoker=true` 잔액 뷰 + select 전용 RLS(`rider_id = auth.uid() or is_admin()`), insert/update 정책 부재 = 차단.
- entry_type:
  - `CHARGE`(구매 충전, +qty, unit_price 스냅샷·purchase_id 필수)
  - `CONSUME`(콜 배정, -qty, order_id 필수)
  - `REFUND`(귀책 환급, +qty, order_id 필수)
  - `ADJUST`(admin 수동 ±qty, PG 환불 시 purchase_id 필수)
- `qty int not null check(qty <> 0)` — **not null 필수**(CHECK는 NULL을 통과시키므로 생략 금지).
- 잔액 음수 방지는 CHECK로 불가(누적합) → **RPC 내부에서 rider 단위 FOR UPDATE 직렬화 후 재계산**(동시 수락 오버스펜드 방어). 부족 시 `raise exception 'INSUFFICIENT_COUPON'`.

### 쿠폰 소진량 (07 §1-2 — D2, 17 C1)
- `coupon_cost = ceil(requested_kg / KG_PER_CAN)` — **kg 기준**(통 개수 아님, 15kg=1통). **주문 생성
  시점에 order-create가 계산해 `pickup_orders.coupon_cost`에 스냅샷**(절대 규칙 5 미러). 이후 계량
  결과(final_kg)와 무관 — 쿠폰은 매칭 수수료이지 기름값이 아니다. 통 크기 프리셋의 kg 환산(08 P6)
  후 산정이므로 공식에 영향 없음. **0(구매 단독 주문, requested_kg 0)이면 null 저장 — 게이트 불요**.
- 콜 카드/상세에 "쿠폰 N장 소진"을 수락 전 노출(라이더가 비용을 알고 수락 — Q3).
- **`coupon_cost is null`인 주문은 게이트 없음** — 복권 이전 생성분(전환기)·구매 단독 주문 모두
  CONSUME/REFUND skip(레거시 규약 그대로, 17 리스크 레지스터).

### 쿠폰 단가·구매·환불 (07 §1-4 — D3, 17 C2·C3)
- 쿠폰 단가는 admin이 결정 — `coupon_price_ticks(unit_price int > 0, effective_at, created_by)`(price_ticks 패턴 미러: 전체 read, admin insert, update/delete 정책 없음 = 정정 불가·신규 tick만).
- 구매 플로우(서버 검증 필수, **기본 PG = 코엠페이먼츠 SIMPLEPAY** — 17 C3): ① rider 구매 신청 →
  `coupon-purchase-intent`가 `coupon_purchases(id, rider_id, qty, unit_price 스냅샷, amount=qty×unit_price,
  pg_order_id unique, payment_key text unique, status PENDING/PAID/FAILED/EXPIRED/REFUNDED)` 생성 +
  코엠 결제창 form 파라미터(checkHash 포함, 서버 생성) 동봉 ② 클라이언트가 결제창으로 hidden form
  POST → 사용자 결제 ③ **코엠은 서버 승인 API가 없어 rUrl 콜백(`coupon-purchase-return`,
  verify_jwt=false)이 유일 확정 경로** — 승인금액 == 서버 스냅샷 amount 검증 후 `fn_confirm_purchase`
  (PENDING→PAID + CHARGE, payment_key=tid) 원자 확정. 멱등 3중: 상태 전이 + payment_key unique +
  coupon_ledger unique(purchase_id, entry_type). (토스 모드는 `coupon-purchase-confirm` 승인 API 경로,
  demo 모드는 결제창 없이 즉시 충전 — 개발·데모 전용, 프로덕션 금지.)
- **orphan 결제 방어**(승인은 됐는데 확정 미도달 — 돈만 나간 최악의 CS): ⓐ 결제 화면 재진입 시 PENDING 건 노출 + [결제 확인 재시도]/[결제 상태 새로고침] ⓑ PENDING TTL 24h 경과 시 EXPIRED 전환(admin 대사 목록에 표시, PG 거래 조회로 승인 여부 확인 후 수동 처리).
- **환불 산정 규칙**: 구매 건(purchase) 단위, **건당 환불 1회 한정**(전액 또는 부분 1회 — `unique(purchase_id, entry_type)` 멱등·REFUNDED 단일 상태의 의도적 귀결. 다회 분할 환불은 약관 확정 시 재설계). 금액은 **해당 건의 unit_price 스냅샷 기준**, 검증은 미사용 잔액(v_coupon_balance) ≥ 환불 qty — **환불 RPC도 rider 단위 FOR UPDATE 직렬화 후 잔액 재계산**(동시 수락과의 경합 방지). 원장 기록은 ADJUST(-qty, purchase_id 필수), coupon_purchases.status FOR UPDATE 상태 기반 멱등. 통계에서 "purchase_id 있는 ADJUST" = PG 환불로 구분 집계.
- **PG 시크릿 키는 Edge Function 전용**(절대 규칙 3의 확장) — 클라이언트 번들엔 결제창 파라미터/클라이언트 키만.
- 쿠폰 = **플랫폼 자기 용역(콜 배정) 전용**. 기름값 충당 금지, 제3자 사용처 금지, 환불은 미사용분 단순 환불로 한정 — 이 3가지가 전금법 선불전자지급수단 비해당의 성립 조건(규제 분석 결과). **설계 변경 금지.**
- **좌상 실적은 조회 전용**(17 C5) — 쿠폰은 좌상 정산 체인(14)에 편입하지 않는다. 경로는
  `pickup_orders.coupon_cost` 경유(coupon_ledger는 본인+admin RLS라 좌상 조인 금지).

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
  오프라인 정산 청구 근거로만 기록. **정산 이력(09 H8)**: admin이 오프라인 지급 후 `referral-settle`로
  `reward_settled_at/by` 마킹(ACTIVATED만, 멱등, 해제 지원) — 통계 뷰가 settled/unsettled 분리 집계.
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
| CANCEL(admin, fault 기록) | rider+supplier | 취소 통지 ([17 복권] 쿠폰 주문 + SUPPLIER/SYSTEM 귀책이면 rider에 "쿠폰 N장 환급" 카피) |
| 출금 승인/지급/반려 | supplier | "출금 신청이 승인되었어요" / "출금이 완료되었어요" / "출금 신청이 반려되어 포인트가 복구되었어요" |
| 정지/해제(07 F11) | rider | 정지 사유/해제 통지 |
| 인증 승인/반려 | rider | 검수 결과 통지 |
| CONFIRM 리마인드 자동 [16 L5] (제출 후 2h/12h, order-expire) | supplier | "수거 확인이 기다리고 있어요 — 확인하면 지급이 확정돼요" |
| CONFIRM 리마인드 수동 [16 L5] (rider발 confirm-remind, 주문당 2h 1회) | supplier | SUBMIT_MEASURE 수단별 카피 재발송(동일 문구) |
| 확인 지연 에스컬레이션 [16 L5] (제출 후 24h) | admin | "계량 제출 후 24시간째 점주 확인이 없어요 — 중재/완료 처리 검토" |
| 쿠폰 충전 완료 [17 복권] (confirm/코엠 return 콜백, kind=`COUPON_CHARGED`) | rider | "쿠폰 N장 충전 완료" (link /coupons/purchase) |
| 쿠폰 환급 [17 복권] (coupon-refund) | rider | "쿠폰 N장이 환급되었어요." (link /coupons/purchase) |

기존 유지: 콜 도착 브로드캐스트(반경 내 rider), 수락됨(supplier), 도착(supplier), 30분 무수락
취소(supplier+admin) 기본 통지.

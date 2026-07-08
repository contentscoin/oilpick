# 00. 도메인 스펙 (단일 진실)

> **[07 피벗]** 이 문서는 07-pivot-plan.md §1-1~1-6에 확정된 수거쿠폰 신모델을 반영한다. 구모델(포인트 적립·수거비·집하장 배송/QR)은 삭제하지 않고 **레거시**로 강등해 보존한다(프로덕션 잔존 주문 완결용). 신규 설계 판단은 07이 단일 진실.

## 용어 (코드 네이밍 고정)
| 한글 | 코드 | 설명 |
|---|---|---|
| 사용자(공급업체) | `supplier` | 폐식용유 배출·판매하는 매장. 신모델에서 **현장 현금 수령** |
| 라이더(수거업체) | `rider` | 콜 수락 → 현장 계량 → **현금 매입** → 허가 재활용업체(인계처) 인계 |
| 회사(관리자) | `admin` | 시세·쿠폰 단가 결정, 라이더 관리(승인/정지/충전), 쿠폰 매출·수거 통계, CS |
| 수거 주문 | `pickup_order` | 수거 요청 1건 |
| 시세 | `price_tick` | 매입가 (원/kg) |
| 수거쿠폰 | `coupon` (`coupon_ledger`) | 라이더가 콜 배정을 받기 위해 사전 구매·소진하는 **매칭 수수료 수단**(플랫폼 수익원). 잔액은 `v_coupon_balance` 뷰로만 조회 |
| 쿠폰 단가 | `coupon_unit_price` (`coupon_price_ticks.unit_price`) | admin이 결정하는 쿠폰 1장당 가격 (원). tick 방식 |
| 현금 매입 | (cash purchase) | 라이더가 현장 계량 후 시세에 맞춰 점주에게 **직접 현금 지급**하고 기름을 매입하는 행위 (`pickup_orders.cash_paid_amount`) |
| 인계처 | `recycler` (`recycler_name`/`recycler_contact`) | 라이더가 수거한 기름을 매각·인계하는 허가 재활용업체 (승인 조건, 07 F11) |
| 수거비 | `rider_fee` | **레거시(신모델에서 소멸)** — 회사가 라이더에게 주던 용역비 (P). 신규 미기록 |
| 포인트 | `point` | **레거시(신규 발행 중지, 07 D1)** — 1P = 1원. 정수 |
| 집하장 | `depot` | **레거시(신모델에서 소멸)** — 구모델 지정 배송지 |

## 주문 상태머신

상태: `REQUESTED → ACCEPTED → ARRIVED → COMPLETED`
예외: `CANCELLED`, `DISPUTED`
레거시 잔존 상태: `PICKED_UP`, `DELIVERED` (신규 주문 도달 불가 — 아래 "레거시 주문 전용 전이" 참조. enum 값은 삭제 금지)

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| (생성)→REQUESTED | supplier | 진행중 주문 3건 미만 | 시세 스냅샷 + **`coupon_cost` 스냅샷**(= `ceil(requested_kg / KG_PER_CAN)`, §쿠폰 소진량) 저장, 매칭 브로드캐스트 시작. rider_fee 스냅샷 중지(레거시) |
| REQUESTED→ACCEPTED | rider | 라이더 verified & online & 진행중 주문 없음 + **쿠폰 잔액 ≥ coupon_cost**. **선착순 1명**(조건부 `UPDATE ... WHERE status='REQUESTED'` 락) | `coupon_ledger` **CONSUME(-coupon_cost)** — ACCEPT와 같은 트랜잭션(coupon_cost null=레거시 → CONSUME skip). supplier 푸시 "라이더 배정" |
| ACCEPTED→ARRIVED | rider(배정 본인) | — | supplier 푸시 "도착" |
| ARRIVED (SUBMIT_MEASURE) | rider(배정 본인) | 계량값(kg) 입력 + 현장 사진 ≥1장 | measured_kg/photo_urls 저장(상태 유지 ARRIVED), 앱에 "지급할 현금 = kg×스냅샷시세" 표시, supplier 푸시 "계량 결과 도착 — 무게·현금 확인". 현장 순서: 계량 제출 → 라이더가 점주에게 현금 지급 → 점주 앱 확인 |
| ARRIVED→COMPLETED | supplier 본인 (CONFIRM_MEASURE) | 계량 제출됨 | **의미 재정의: "무게 확인 + 현금 ₩N 수령 확인"(2자 확인)**. `final_kg=measured_kg`, `cash_paid_amount = round(final_kg × snapshot_price_per_kg)`, `completed_at = now()`. ❌ EARN/HOLD 발행 없음, PICKED_UP/DELIVERED 생략(즉시 완료). rider 푸시 "현금 지급 확인" |
| ARRIVED→DISPUTED | supplier 본인 | 현금 지급 전 계량 이의(사유 텍스트 필수) | admin 알림 |
| DISPUTED→ARRIVED | admin (RESOLVE_DISPUTE) | — | **의미 재정의: 중재는 kg 확정까지만** — `final_kg` 고정(이후 SUBMIT_MEASURE 재제출 불가). 현금 지급·수령 확인이 남아 **ARRIVED 복귀**(COMPLETED 아님) → 일반 CONFIRM_MEASURE(점주 수령 확인) 경로로 COMPLETED 도달. 양쪽 알림 "확정 무게 O.Okg". ⚠️ 구모델의 "중재=즉시 확정·지급"과 다름(2자 확인 원칙 유지) |
| ARRIVED→COMPLETED | admin (FORCE_COMPLETE, D6 예외 경로) | 계량 제출/중재 kg 존재 + memo(사유) 필수 | 제출/중재 kg 기반 `cash_paid_amount` + `completed_at` 기록, order_events 기록, CS 티켓(07 F12) 연동. 점주가 수령 확인을 거부·방치하는 교착 해소용. 양쪽 알림 |
| REQUESTED→CANCELLED | supplier 자진 또는 시스템 30분 무수락 | 수락 전 언제나 / 브로드캐스트 30분 무수락 시 자동(NO_RIDER) | 쿠폰 미소진 → 환급 없음(해당 없음). supplier 푸시 |
| {ACCEPTED\|ARRIVED\|DISPUTED}→CANCELLED | admin 전용 | **fault 파라미터 필수**(`'SUPPLIER'`\|`'RIDER'`\|`'SYSTEM'`, D4·D6) | SUPPLIER/SYSTEM → `coupon_ledger` **REFUND(+coupon_cost)** + rider "쿠폰 N장 환급" 알림(+supplier 통지). RIDER → 환급 없음. **가드: REFUND 전 동일 order_id+rider_id의 CONSUME 존재·qty 일치 확인, 없으면 skip**(레거시 주문 무근거 환급 방지) |

- 현금 지급 증빙 = 계량 사진 + 공급자의 앱 내 CONFIRM(금액 명시 승인) **2자 확인**. 지급 후 분쟁("확인은 했는데/안 했는데 돈이…")은 상태머신이 아닌 **CS(07 F12, category=CASH_DISPUTE)** 영역.
- ARRIVED 24시간 초과 체류 주문은 admin OrdersPage에서 하이라이트(교착 조기 감지, 07 F12-⑤).
- 모든 전이는 `order_events`에 (order_id, from, to, actor_id, payload jsonb) append.
- 잘못된 전이 요청은 409 에러. 상태머신 검증 함수는 `packages/core/src/orderMachine.ts`에 순수 함수로 구현하고 Edge Function과 클라이언트 UI(버튼 노출)가 공유한다. 레거시 전이(PICKED_UP/DELIVERED 경로)는 별도 함수로 분리 유지.

### 레거시 주문 전용 전이 (신규 주문 도달 불가 — 프로덕션 잔존분 완결용)
`coupon_cost is null`(게이트 활성 전 생성)이거나 이미 PICKED_UP에 도달한 잔존 주문만 아래 구모델 경로로 완결한다. enum 값(PICKED_UP/DELIVERED/EARN 등)은 절대 삭제하지 않는다(07 §0 프로덕션 전제).

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| ARRIVED→PICKED_UP | rider | (구모델) 계량+사진+supplier 확인 | ① supplier에 `EARN` = round(확정kg × 시세) ② rider에 `HOLD` = 수거비 (레거시 지급) |
| DISPUTED→PICKED_UP | admin | (구모델) 중재 수량 확정 | 위와 동일 지급 (중재 수량 기준) |
| PICKED_UP→DELIVERED | rider | 집하장 QR 코드 스캔 검증 (depot.qr_secret 일치) | rider `HOLD` → `RELEASE` (지급 확정) |
| DELIVERED→COMPLETED | 시스템 | DELIVERED 즉시 자동 | 별점 요청 푸시(선택) |

## 매칭 규칙
1. REQUESTED 시 매장 위치 반경 **3km** 내 `online & verified & 진행중 주문 없음` 라이더 전원에게 푸시.
2. 5분 무수락 → 반경 **7km** 재브로드캐스트. 다시 5분 → **15km**. 30분 무수락 → 자동 CANCELLED
   (사유: `NO_RIDER`) + supplier에게 안내 푸시 + admin 알림.
3. 수락은 선착순. 두 번째 이후 수락 시도는 409 `ALREADY_ACCEPTED`.

## 포인트 원장 규칙 (레거시 — 신규 발행 중지, 07 D1)
> 신모델은 현금 직거래로 전환했다(07 D1). EARN/HOLD/RELEASE/WITHDRAW의 **신규 발행은 전면 중지**하며, `point_ledger` 테이블·과거 데이터는 append-only 회계 기록으로 **보존**한다(삭제 금지). 지갑/출금 UI는 "수령 이력"으로 대체(07 F8/F13). 아래 규칙은 레거시 주문 완결·감사 목적으로만 유효하다.

- `point_ledger`는 **append-only**. UPDATE/DELETE 금지 (트리거로 차단).
- entry_type: `EARN`(supplier 매각대금) `HOLD`(rider 수거비 보류) `RELEASE`(보류 확정)
  `WITHDRAW_REQUEST`(출금 신청 시 차감) `WITHDRAW_CANCEL`(반려 시 복구) `ADJUST`(admin 수동) `PURCHASE`(쇼핑몰, Phase 5)
- 부호 규칙: 잔액 증가 = 양수, 감소 = 음수. HOLD는 `held` 컬럼 별도 집계 (잔액에 미포함, "보류 중" 표시용).
  - PICKED_UP: rider에 HOLD(+fee, held로 집계) — 사용 가능 잔액 아님
  - DELIVERED: RELEASE 행 추가 → held에서 빠지고 available로 이동
- 출금: 신청 시 `WITHDRAW_REQUEST`(-금액) 즉시 차감 → admin 승인(이체는 수동) 또는 반려(`WITHDRAW_CANCEL` +금액).
  최소 출금 10,000P. 잔액 초과 신청은 400.
- 잔액 조회는 `v_point_balance` 뷰만 사용 (user_id, available, held).
- 불변식(테스트로 검증): 주문 1건 COMPLETED 시 원장 합 = supplier EARN + rider HOLD + rider RELEASE이고
  HOLD 금액 == RELEASE 금액 == 주문 스냅샷 rider_fee.

## 쿠폰 원장 규칙 (07 §1-1 — 절대 규칙 1의 확장)
- **쿠폰은 클라이언트에서 절대 쓰지 않는다.** `coupon_ledger` insert는 service_role RPC(`fn_charge_coupon`/`fn_consume_coupon`)에만 존재. 잔액은 `v_coupon_balance` 뷰로만 조회. `rider_profiles`에 잔액 컬럼 금지(원장+뷰 분리).
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

## 쿠폰 소진량 (07 §1-2 — D2)
- `coupon_cost = ceil(requested_kg / KG_PER_CAN)` — **kg 기준**(통 개수 아님). **주문 생성 시점에 order-create가 계산해 `pickup_orders.coupon_cost`에 스냅샷**(절대 규칙 5 미러). 이후 계량 결과(final_kg)와 무관 — 쿠폰은 매칭 수수료이지 기름값이 아니다. 통 크기 프리셋 도입(07 F9-③)은 이 공식에 영향 없음(kg 환산 후 산정).
- 콜 카드/상세에 "쿠폰 N장 소진"을 수락 전 노출(라이더가 비용을 알고 수락).
- **`coupon_cost is null`인 주문은 레거시(게이트 활성 전 생성)로 간주 — CONSUME/REFUND 모두 skip.**

## 쿠폰 단가·구매·환불 (07 §1-4 — D3)
- 쿠폰 단가는 admin이 결정 — `coupon_price_ticks(unit_price int > 0, effective_at, created_by)`(price_ticks 패턴 미러: 전체 read, admin insert, update/delete 정책 없음 = 정정 불가·신규 tick만).
- 구매 플로우(서버 검증 필수): ① rider 구매 신청 → `coupon-purchase-intent`가 `coupon_purchases(id, rider_id, qty, unit_price 스냅샷, amount=qty×unit_price, pg_order_id unique, payment_key text unique, status PENDING/PAID/FAILED/EXPIRED/REFUNDED)` 생성 ② 클라이언트 토스페이먼츠 결제위젯 결제 ③ `coupon-purchase-confirm`이 **coupon_purchases 행 FOR UPDATE 잠금 → status=PENDING 재확인 → 시크릿 키로 토스 승인 API 호출 + amount 일치 검증 → 같은 트랜잭션에서 fn_charge_coupon(CHARGE) + status=PAID 전이**. 멱등 3중: 상태 전이 + payment_key unique + coupon_ledger unique(purchase_id, entry_type).
- **orphan 결제 방어**(승인은 됐는데 confirm 미호출 — 돈만 나간 최악의 CS): ⓐ 결제 화면 재진입 시 PENDING 건 노출 + [결제 확인 재시도] 버튼(confirm 멱등이라 재호출 안전) ⓑ PENDING TTL 24h 경과 시 EXPIRED 전환(admin 대사 목록에 표시, 토스 결제 조회 API로 승인 여부 확인 후 수동 처리).
- **환불 산정 규칙**: 구매 건(purchase) 단위, **건당 환불 1회 한정**(전액 또는 부분 1회 — `unique(purchase_id, entry_type)` 멱등·REFUNDED 단일 상태의 의도적 귀결. 다회 분할 환불은 약관 확정 시 재설계). 금액은 **해당 건의 unit_price 스냅샷 기준**, 검증은 미사용 잔액(v_coupon_balance) ≥ 환불 qty — **환불 RPC도 rider 단위 FOR UPDATE 직렬화 후 잔액 재계산**(동시 수락과의 경합 방지). 원장 기록은 ADJUST(-qty, purchase_id 필수), coupon_purchases.status FOR UPDATE 상태 기반 멱등. 통계에서 "purchase_id 있는 ADJUST" = PG 환불로 구분 집계.
- **PG 시크릿 키는 Edge Function 전용**(절대 규칙 3의 확장) — 클라이언트 번들엔 클라이언트 키만.
- 쿠폰 = **플랫폼 자기 용역(콜 배정) 전용**. 기름값 충당 금지, 제3자 사용처 금지, 환불은 미사용분 단순 환불로 한정 — 이 3가지가 전금법 선불전자지급수단 비해당의 성립 조건(규제 분석 결과). **설계 변경 금지.**

## 시세 규칙
- admin이 (원/kg 매입가) 설정 → `price_ticks` insert (effective_at now). **수거비(rider_fee) 입력은 삭제**(레거시, price-set 계약 개정 07 F3b-④).
- 현재 시세 = effective_at 최신 1건.
- 스냅샷은 주문 생성 시 최신 tick에서(절대 규칙 5).

### 시세 일별 차트 규칙 (07 §1-5)
- 하루 대표값 = **그날 마지막 tick(종가)**. tick 없는 날 = **직전값 캐리포워드**(평평한 선).
- 구현은 클라이언트 리샘플(`packages/core resampleDaily`) — DB 뷰 불필요(소비자가 전부 JS).
- "전일 대비" 등락은 **일별 종가[n-1] 기준**으로 산정(직전 tick 대비 아님).
- 운영 룰: admin은 **영업일 최소 1회 시세 tick 등록**(차트 품질의 전제).

## 계량/수량 규칙
- supplier 요청 시 입력: 통 수(18L 통 기준) 또는 kg 직접 입력. 예상 kg = 통 수 × 15kg (상수 `KG_PER_CAN = 15`).
- 예상 현금 수령액 = 예상 kg × 시세 (UI 표시용, "현장 계량 기준으로 확정됩니다" 문구 필수). 구모델 "예상 포인트" 표기 폐기(07 D1).
- 확정 현금 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림 (`cash_paid_amount`).

## 라이더 인증
- 가입 시 서류 3종 업로드(사업자등록증, 차량 사진, 폐기물 수집·운반 허가증 — 허가증은 선택).
- rider_profiles.verify_status: `PENDING → APPROVED | REJECTED` (admin 검수). **`SUSPENDED`(정지) 추가**(07 F2 스키마, 액션·정책은 07 F11).
- APPROVED 전에는 콜 목록 조회/수락 불가 (RLS + API 가드). SUSPENDED도 동일 차단(APPROVED 체크로 자동).
- 인증 QR: rider_id + 발급시각 서명 토큰(JWT, 5분 만료)을 R9 화면에 표시. supplier 앱에서 스캔 검증(Phase 1은 화면 제시만, 스캔 검증은 Phase 2).

## 알림 매트릭스 (07 §1-6 — 구모델 표 전면 교체, 푸시 + notifications 테이블 기록)
> 구모델 행 삭제: "포인트 지급(EARN)", "수거비 보류/지급(HOLD/RELEASE)", "배송완료", "출금 신청/처리". 신모델 매트릭스:

| 이벤트 | 수신자 | 카피(요지) |
|---|---|---|
| SUBMIT_MEASURE | supplier | "계량 결과가 도착했어요 — 무게·현금 ₩N을 확인해 주세요" |
| CONFIRM_MEASURE(완료) | rider | "수거 완료 — 현금 ₩N 지급이 확인됐어요" |
| FORCE_COMPLETE | supplier+rider | "관리자 확인으로 주문이 완료 처리됐어요" |
| RESOLVE_DISPUTE | supplier+rider | "이의신청 중재 결과: 확정 무게 O.Okg" |
| CANCEL(fault=SUPPLIER/SYSTEM) | rider | "주문 취소 — 쿠폰 N장이 환급되었어요" (+supplier 통지) |
| CANCEL(fault=RIDER) | rider+supplier | 취소 통지(환급 문구 없음) |
| 쿠폰 충전 성공(confirm) | rider | "쿠폰 N장 충전 완료" |
| 정지/해제(07 F11) | rider | 정지 사유/해제 통지 |
| 인증 승인/반려 | rider | 검수 결과 통지 |

기존 유지: 콜 도착 브로드캐스트(반경 내 rider), 수락됨(supplier), 도착(supplier), 30분 무수락 취소(supplier+admin) 기본 통지.

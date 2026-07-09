# 07 — 고도화 2차: 수거쿠폰 피벗 (F-태스크)

2026-07-08 CEO 지시 + 9-agent 전수 분석(스펙/코드 6영역 + 비즈니스 영향·규제·디자인 3축) +
어드버서리얼 리뷰 1회(정합성/완결성/실행가능성 3렌즈, critical 5건 반영)로 확정한 비즈니스 모델 피벗 계획.
04/06과 같은 방식: **위에서부터 순서대로**, 각 태스크는 DoD 만족해야 종료.
이 문서는 05-design-upgrade.md의 비범위(정보구조·라우팅 변경 금지, 신규 화면 금지)를 **명시적으로 override**하고,
06-enhancement-plan.md의 일부 태스크를 폐기/대체한다(하단 "06 백로그 판정" 참조).

표기: 【U】user 【R】rider 【A】admin 【core】packages/core 【ui】packages/ui 【DB】supabase

---

## 0. 신모델 정의 (CEO 확정)

**구모델**: 플랫폼이 공급자(점주)에게 EARN 포인트, 라이더에게 수거비(HOLD→RELEASE)를 **지급**.
라이더는 수거한 기름을 집하장(depot)에 배송(QR 검증). 플랫폼 수익원 없음(MVP).

**신모델**: 돈의 방향이 반대가 된다.
1. 라이더는 **수거쿠폰**을 플랫폼에서 사전 구매(PG 결제)한다. 콜을 배정받으려면 주문 용량에 비례한
   쿠폰을 소진한다. **플랫폼 수익 = 쿠폰 판매**.
2. 라이더는 현장에서 계량 후 **시세(admin 결정 price_ticks)에 맞춰 현금을 점주에게 직접 지급**하고
   기름을 매입·수거한다. 수거한 기름은 라이더가 **허가 재활용업체에 인계(매각)** 한다
   — 플랫폼은 이후 물류에 관여하지 않는다(집하장/QR 폐지).
3. 점주(user 앱) 관점: 포인트 적립·출금이 아니라 **현장 현금 수령**. 유저앱 메인은 일별 시세 차트가 주인공.
4. admin: 시세·쿠폰 단가 결정, 라이더 관리(승인/정지/충전), 쿠폰 매출·수거 통계, CS.

### 결정 기록
| # | 결정 사항 | 확정 내용 |
|---|---|---|
| D1 | 기존 포인트 적립·출금 | **완전 폐기** — 현금 직거래로 전환. 지갑/출금 UI 제거, "수령 이력"으로 대체 (CEO) |
| D2 | 쿠폰 소진 단위 | **용량(kg) 비례** — `KG_PER_CAN`(15kg) 단위당 1장, 즉 `ceil(requested_kg/15)`. **통 개수가 아니라 kg 기준**(F9-③ 통 크기 가변 도입과 무관 — kg 환산 후 산정). 주문 생성 시점 스냅샷 (CEO) |
| D3 | 쿠폰 결제 | **처음부터 PG 연동** (토스페이먼츠 권장). admin 수동 조정(ADJUST)은 CS용 보조 (CEO) |
| D4 | 취소 시 쿠폰 | **귀책 기준 환급** — admin 취소 시 fault 선택 필수: `SUPPLIER`(점주 귀책·노쇼)/`SYSTEM`(플랫폼 귀책 — 시세 오등록·매칭 오류 등)=자동 환급, `RIDER`(라이더 귀책)=소진 유지 (CEO) |
| D6 | admin 취소·강제완결 범위 | ACCEPTED뿐 아니라 **ARRIVED/DISPUTED에서도 admin CANCEL(+fault) 허용**. 계량 제출 후 점주가 확인을 거부하는 교착은 **admin FORCE_COMPLETE**(제출/중재 kg 기반, 사유 필수)로 해소 (기획 확정 — F3a CANCEL 분기 설계에 선행 필요해 즉시 결정) |
| — | 데모 라이더 선지급 | 게이트 활성 전 데모 라이더 2개에 ADJUST **20장** 선지급(memo 기록, 추후 조정 가능) (확정) |

> ✅ **D5 (CEO 승인 — 2026-07-09)**: 지시문의 "수거한 기름은 라이더가 처리함"을 **"허가 재활용업체 인계(매각)"로
> 재정의**했고 CEO가 승인했다. F11(신고증 필수화+인계처 등록) 진행 확정, 법률 서면 질의는 병행 발주. 문자 그대로의 자체 처리(정제·처분)는 폐기물관리법상 무허가 폐기물처리업(5년 이하 징역/5천만원
> 이하 벌금)이라 개인 라이더에게 불가능. 라이더의 수거·운반 자체는 폐기물관리법 **제46조 폐기물처리 신고**
> (허가 아님, 처리기간 ~14일)로 합법화 가능 — 단 신고 완료 라이더에게만 콜을 열어야 한다(F11).
> (원 경고문: 이견 시 법률 검토 완료 전까지 F11 착수 금지 — 승인으로 해소.)

### 프로덕션 전제 (마이그레이션 단순화 근거)
현재 프로덕션(dbvgxuevhmyoprafarnh + Vercel 3앱)은 **데모 계정만 존재, 실사용자 0명** (실 SMS 미연동,
테스트 OTP 6개 번호). 따라서 기존 포인트 잔액은 지급 채무가 아니며 **일몰 기간 없이 클린 컷오버** 가능.
point_ledger 테이블·과거 데이터는 append-only 회계 기록으로 보존(삭제 금지), 신규 발생만 중지한다.
DELIVERED/EARN 등 **enum 값은 절대 삭제하지 않는다**(Postgres enum 삭제는 파괴적, 기존 행이 참조).

---

## 1. 도메인 규칙 신설·개정 (F1에서 00-domain.md에 정식 반영)

### 1-1. 쿠폰 원장 (절대 규칙 1의 확장)
- **쿠폰은 클라이언트에서 절대 쓰지 않는다.** `coupon_ledger` insert는 service_role RPC에만 존재.
  잔액은 `v_coupon_balance` 뷰로만 조회. `rider_profiles`에 잔액 컬럼 금지(원장+뷰 분리).
- point_ledger의 3중 무결성 패턴을 그대로 미러링 (01-db-schema.sql:113-154 참조):
  ① append-only 강제 트리거(`forbid_coupon_mutation` — UPDATE/DELETE 무조건 예외, service_role도 불가)
  ② 멱등 unique 2종 — `unique(order_id, entry_type, rider_id)` (CONSUME/REFUND 재시도 안전) +
  `unique(purchase_id, entry_type) where purchase_id is not null` (CHARGE/PG환불 멱등).
  **주의: Postgres NULLS DISTINCT 때문에 order_id가 NULL인 행(CHARGE/ADJUST)은 첫 번째 unique의 적용
  대상이 아니다(중복 삽입 허용 — 다중 충전에 필요한 의도된 동작). CHARGE 멱등은 두 번째 unique와
  coupon_purchases 상태 전이가 담당** (기존 선례: 20260704000008:65-66의 NULL distinct 주석).
  ③ `security_invoker=true` 잔액 뷰 + select 전용 RLS(`rider_id = auth.uid() or is_admin()`), insert/update 정책 부재=차단.
- entry_type: `CHARGE`(구매 충전, +qty, unit_price 스냅샷·purchase_id 필수) / `CONSUME`(콜 배정, -qty, order_id 필수) /
  `REFUND`(귀책 환급, +qty, order_id 필수) / `ADJUST`(admin 수동 ±qty, PG 환불 시 purchase_id 필수).
- `qty int not null check(qty <> 0)` — **not null 필수**(CHECK는 NULL을 통과시키므로 생략 금지).
- 잔액 음수 방지는 CHECK로 불가(누적합) → **RPC 내부에서 rider 단위 FOR UPDATE 직렬화 후 재계산**
  (fn_request_withdraw의 검증된 패턴, 20260704000007:40).

### 1-2. 쿠폰 소진량 (D2)
- `coupon_cost = ceil(requested_kg / KG_PER_CAN)` — **kg 기준**(통 개수 아님). **주문 생성 시점에
  order-create가 계산해 `pickup_orders.coupon_cost`에 스냅샷**(절대 규칙 5 미러). 이후 계량 결과(final_kg)와
  무관 — 쿠폰은 매칭 수수료이지 기름값이 아니다. F9-③의 통 크기 프리셋 도입은 이 공식에 영향 없음(kg 환산 후 산정).
- 콜 카드/상세에 "쿠폰 N장 소진"을 수락 전 노출(라이더가 비용을 알고 수락).
- **`coupon_cost is null`인 주문은 레거시(게이트 활성 전 생성)로 간주 — CONSUME/REFUND 모두 skip.**

### 1-3. 신 상태머신 (구 상태 DELIVERED/PICKED_UP은 레거시 주문 전용으로만 잔존)
```
(생성)→REQUESTED : supplier. 부수효과: coupon_cost 스냅샷. [기존 가드 유지: 진행중 3건 미만]
REQUESTED→ACCEPTED : rider. 가드 추가: 쿠폰 잔액 ≥ coupon_cost.
                     부수효과: coupon_ledger CONSUME(-coupon_cost) — ACCEPT와 같은 트랜잭션.
                     (coupon_cost null=레거시 → CONSUME skip)
ACCEPTED→ARRIVED   : rider(배정 본인). [기존 유지]
ARRIVED(SUBMIT_MEASURE) : rider가 kg+사진 제출 + 앱에 "지급할 현금 = kg×스냅샷시세" 표시. [상태 유지, 기존 유지]
                     현장 순서: 계량 제출 → 라이더가 점주에게 현금 지급 → 점주가 앱에서 수령 확인(아래).
ARRIVED→COMPLETED  : supplier CONFIRM_MEASURE — 의미 재정의: "무게 확인 + 현금 ₩N 수령 확인"(2자 확인).
                     부수효과: cash_paid_amount = round(final_kg × snapshot_price_per_kg), completed_at = now().
                     ❌ EARN/HOLD 발행 제거. PICKED_UP/DELIVERED 단계 생략(즉시 완료).
ARRIVED→DISPUTED   : supplier(현금 지급 전 계량 이의). [기존 유지]
DISPUTED→ARRIVED   : admin RESOLVE_DISPUTE — 의미 재정의: **중재는 kg 확정까지만**(final_kg 고정, 이후
                     SUBMIT_MEASURE 재제출 불가). 현금 지급·수령 확인이 아직 남았으므로 ARRIVED로 복귀,
                     이후 일반 CONFIRM_MEASURE(점주 수령 확인) 경로로 COMPLETED 도달. ⚠️ 구모델의
                     "중재=즉시 확정·지급"과 다름 — 2자 확인 원칙(현금 증빙)이 중재 경로에서도 유지돼야 함.
ARRIVED→COMPLETED  : admin FORCE_COMPLETE (D6 예외 경로) — 계량 제출/중재 완료 후 점주가 수령 확인을
                     거부·방치하는 교착 해소용. 제출/중재 kg 기반 cash_paid_amount 기록 + 사유(memo) 필수
                     + order_events 기록. CS 티켓(F12)과 연동.
REQUESTED→CANCELLED: supplier 자진 or 시스템 30분 무수락. 쿠폰 미소진 → 환급 없음(해당 없음).
{ACCEPTED|ARRIVED|DISPUTED}→CANCELLED : admin 전용 + 귀책 파라미터(fault: 'SUPPLIER'|'RIDER'|'SYSTEM') 필수. (D4·D6)
                     SUPPLIER/SYSTEM → coupon_ledger REFUND(+coupon_cost). RIDER → 환급 없음.
                     가드: REFUND 전 해당 order_id+rider_id의 CONSUME 존재·qty 일치 확인, 없으면 skip
                     (레거시 주문 무근거 환급 방지).
```
- 현금 지급 증빙 = 계량 사진 + 공급자의 앱 내 CONFIRM(금액 명시 승인) 2자 확인. 지급 후 분쟁("확인은
  했는데/안 했는데 돈이…")은 상태머신이 아닌 **CS(F12, category=CASH_DISPUTE)** 영역.
- ARRIVED 24시간 초과 체류 주문은 admin OrdersPage에서 하이라이트(교착 조기 감지, F12-⑤).
- rider_fee(수거비) 개념 소멸: price_ticks.rider_fee·pickup_orders.snapshot_rider_fee는 nullable 전환 후
  신규 미기록(컬럼·과거 데이터 보존). **price-set 계약·zod 스키마 개정 필수(F3b-④ — 누락 시 시세 등록 마비).**

### 1-4. 쿠폰 단가·구매 (D3)
- 쿠폰 단가는 admin이 결정 — `coupon_price_ticks(unit_price int >0, effective_at, created_by)`
  (price_ticks 패턴 미러: 전체 read, admin insert, update/delete 정책 없음=정정 불가·신규 tick만).
- 구매 플로우(서버 검증 필수): ① rider가 구매 신청 → `coupon-purchase-intent`가
  `coupon_purchases(id, rider_id, qty, unit_price 스냅샷, amount=qty×unit_price, pg_order_id unique,
  payment_key text unique, status PENDING/PAID/FAILED/EXPIRED/REFUNDED)` 생성 ② 클라이언트 토스페이먼츠
  결제위젯 결제 ③ `coupon-purchase-confirm`이 **coupon_purchases 행을 FOR UPDATE 잠금 → status=PENDING
  재확인 → 시크릿 키로 토스 승인 API 호출 + amount 일치 검증 → 같은 트랜잭션에서 fn_charge_coupon(CHARGE)
  + status=PAID 전이**. 멱등 3중: 상태 전이 + payment_key unique + coupon_ledger unique(purchase_id, entry_type).
- **orphan 결제 방어(승인은 됐는데 confirm 미호출 — 돈만 나간 최악의 CS)**: ⓐ 결제 화면 재진입 시
  PENDING 건 노출 + [결제 확인 재시도] 버튼(confirm 멱등이라 재호출 안전) ⓑ PENDING TTL 24h 경과 시
  EXPIRED 전환(admin 대사 목록에 표시, 토스 결제 조회 API로 승인 여부 확인 후 수동 처리).
- **환불 산정 규칙**: 구매 건(purchase) 단위, **건당 환불 1회 한정**(전액 또는 부분 1회 —
  `unique(purchase_id, entry_type)` 멱등·REFUNDED 단일 상태의 의도적 귀결. 다회 분할 환불은 약관 확정 시
  재설계). 금액은 **해당 건의 unit_price 스냅샷 기준**, 검증은 미사용 잔액(v_coupon_balance) ≥ 환불 qty —
  **환불 RPC도 CONSUME과 동일하게 rider 단위 FOR UPDATE 직렬화 후 잔액 재계산**(동시 수락과의 경합 방지,
  1-1 ③ 원칙). 원장 기록은 ADJUST(-qty, purchase_id 필수), coupon_purchases.status FOR UPDATE 상태 기반
  멱등. 통계에서 "purchase_id 있는 ADJUST"=PG 환불로 구분 집계.
- **에러코드·응답(확정)**: 단가 tick 미설정 상태의 구매 신청 → `COUPON_PRICE_NOT_SET`(409).
  환불 qty > 미사용 잔액 → `INSUFFICIENT_COUPON` 재사용(동일 의미 — 잔액 부족).
  PG 승인/취소 실패(토스 거절·네트워크) → `PAYMENT_FAILED`(402, F4 확정 — amount 위변조의
  VALIDATION_ERROR와 구분). coupon-purchase-confirm 성공 응답은 `{ balance }`(충전 후 잔액).
- **PG 시크릿 키는 Edge Function 전용**(절대 규칙 3의 확장) — 클라이언트 번들엔 클라이언트 키만.
- 쿠폰 = **플랫폼 자기 용역(콜 배정) 전용**. 기름값 충당 금지, 제3자 사용처 금지, 환불은 미사용분 단순
  환불로 한정 — 이 3가지가 전금법 선불전자지급수단 비해당의 성립 조건(규제 분석 결과). 설계 변경 금지.

### 1-5. 시세 일별 차트 규칙
- 하루 대표값 = **그날 마지막 tick(종가)**. tick 없는 날 = **직전값 캐리포워드**(평평한 선).
- 구현은 클라이언트 리샘플(`packages/core resampleDaily`) — DB 뷰 불필요(소비자가 전부 JS).
- "전일 대비" 등락은 **일별 종가[n-1] 기준**으로 교정(현재 HomePage.tsx:29-31은 직전 tick 대비라 부정확).
- 운영 룰: admin은 **영업일 최소 1회 시세 tick 등록**(차트 품질의 전제).

### 1-6. 알림 매트릭스 개정 (구모델 표 00-domain.md:72-84 전면 교체 — F1·F3b에서 반영)
구모델 행 삭제: "포인트 지급(EARN)", "수거비 보류/지급(HOLD/RELEASE)", "배송완료", "출금 신청/처리".
신모델 매트릭스:
| 이벤트 | 수신자 | 카피(요지) |
|---|---|---|
| SUBMIT_MEASURE | supplier | "계량 결과가 도착했어요 — 무게·현금 ₩N을 확인해 주세요" |
| CONFIRM_MEASURE(완료) | rider | "수거 완료 — 현금 ₩N 지급이 확인됐어요" |
| FORCE_COMPLETE | supplier+rider | "관리자 확인으로 주문이 완료 처리됐어요" |
| RESOLVE_DISPUTE | supplier+rider | "이의신청 중재 결과: 확정 무게 O.Okg" |
| CANCEL(fault=SUPPLIER/SYSTEM) | rider | "주문 취소 — 쿠폰 N장이 환급되었어요" (+supplier 통지) |
| CANCEL(fault=RIDER) | rider+supplier | 취소 통지(환급 문구 없음) |
| 쿠폰 충전 성공(confirm) | rider | "쿠폰 N장 충전 완료" |
| 정지/해제(F11) | rider | 정지 사유/해제 통지 |
기존 유지: 콜 도착 브로드캐스트, 수락됨, 도착, 취소 기본 통지.

---

## P1 — 스펙·백엔드 코어

### F1. 【docs】 스펙 문서 개정 (코드 작업 전 선행)
- 작업: ① 00-domain.md — 위 1-1~1-6 반영(용어표에 수거쿠폰/쿠폰 단가/현금 매입/인계 추가, 상태머신 표
  교체, **알림 매트릭스 표 전면 교체(1-6)**, 포인트 원장 절을 "레거시(신규 발행 중지)"로 강등).
  ② 01-db-schema.sql — F2 스키마 반영. ③ 02-api.md — 신규 함수 5개(coupon-purchase-intent/confirm,
  coupon-refund, coupon-adjust, coupon-price-set) 절 신설, **order-create/order-accept/order-transition/
  price-set** 계약 개정(estimatedCash, INSUFFICIENT_COUPON, fault 파라미터, FORCE_COMPLETE 액션,
  riderFee 삭제), 핵심 RPC 목록에 fn_charge_coupon/fn_consume_coupon 추가, withdraw-request/
  withdraw-process/point-adjust에 deprecated 표기. ④ 03-frontend.md — 홈/요청/라이더 화면 스펙 개정 +
  05 비범위 override 각주. ⑤ CLAUDE.md 절대 규칙 1을 "포인트·쿠폰 원장"으로 확장, 규칙 3에 PG 시크릿 추가.
  ⑥ 06-enhancement-plan.md에 하단 "06 백로그 판정" 표 반영([폐기]/[대체] 표시).
- DoD(체크리스트 검증): 본 문서의 신설 객체 각각에 대응 절 존재 — DB(coupon_ledger/coupon_price_ticks/
  coupon_purchases/coupon_cost/cash_paid_amount/completed_at/SUSPENDED/cs_tickets/집계 뷰 2종
  v_coupon_sales_daily·v_pickup_stats_daily/recycler_name·recycler_contact)×01, 함수·RPC(5+2)×02,
  에러코드(INSUFFICIENT_COUPON)×02, 알림 행(1-6 표)×00. 하나라도 없으면 미완료.
- [x] 결과(2026-07-09): 6종 개정 — 00(용어/상태머신 교체+레거시 소절/알림 매트릭스/쿠폰 절 4종 신설),
  01(`[07 F2]` 마커 DDL + F11/F12 예약 마커, is_admin 이후 뷰 배치), 02(신규 절 5 + order-create/accept/
  transition/price-set 계약 개정 + deprecated 3), 03(07 참조 블록 3앱 + 05 override 각주), CLAUDE.md
  (절대규칙 1·3 확장 + 문서 맵), 06(판정 표기 3건). DoD 체크리스트 전 항목 반영(에이전트 자체 검증 +
  스팟 그렙 확인). 미결 3건(에러코드/뷰 강제 방식/confirm 응답)은 §1-4·F2-⑧에 확정 반영.

### F2. 【DB】 마이그레이션 1차 — 쿠폰 스키마 (기존 동작 무영향의 순수 추가)
- 작업 (supabase/migrations/ 순번 파일 + 01-db-schema.sql 동기화):
  ① `create type coupon_entry_type as enum ('CHARGE','CONSUME','REFUND','ADJUST')`.
  ② `coupon_ledger(id identity PK, rider_id uuid not null FK profiles, entry_type coupon_entry_type not null,
  qty int not null check(qty<>0), unit_price int check(entry_type<>'CHARGE' or unit_price>0),
  order_id uuid FK pickup_orders, purchase_id uuid, memo text, created_by uuid FK profiles, created_at,
  unique(order_id, entry_type, rider_id))` + **부분 유니크 `unique(purchase_id, entry_type) where purchase_id
  is not null`** + `forbid_coupon_mutation` 트리거(01:130-134 복제) + `v_coupon_balance`(security_invoker) +
  select 전용 RLS. (NULL unique 동작은 1-1 ② 참조)
  ③ `coupon_price_ticks` (1-4, price_ticks 패턴 232-234 복제).
  ④ `coupon_purchases` (1-4 정의 그대로 — **payment_key text unique 포함**, status enum에 EXPIRED 포함.
  RLS: rider 본인+admin select, 쓰기는 Edge Function만).
  ⑤ `pickup_orders`에 `coupon_cost int`, `cash_paid_amount int`, **`completed_at timestamptz`** 추가
  (레거시 행 null 허용. 레거시 완료 시각 조회는 `coalesce(completed_at, delivered_at, picked_up_at)` 규약 —
  F6/F10 집계의 기준 컬럼).
  ⑥ `price_ticks.rider_fee`, `pickup_orders.snapshot_rider_fee` not null 해제(check는 not null일 때만).
  ⑦ `alter type verify_status add value 'SUSPENDED'` (별도 마이그레이션 파일 — enum add는 사용 트랜잭션과 분리).
  ⑧ 집계 뷰 2종(admin 전용 — 강제 방식: `security_invoker=true` + `where is_admin()` 게이트, 비관리자는
  빈 결과): `v_coupon_sales_daily`(CHARGE 합계, REFUND/ADJUST·PG환불 구분 병기),
  **`v_pickup_stats_daily`**(일별 COMPLETED 건수/final_kg 합/cash_paid_amount 합 — completed_at 기준.
  수거 활동 시계열, 쿠폰 매출과 상관 분석용).
- DoD: `supabase db reset` 성공. 기존 pgTAP 3종 green(기존 플로우 무영향 증명). 01-db-schema.sql 동기화.
- [x] 결과(2026-07-09): 마이그레이션 2개(20260709000001 SUSPENDED enum 분리 / 20260709000002 쿠폰 스키마
  전체 — enum 2종·테이블 3·뷰 3·트리거·RLS·GRANT). db reset 18개 적용 성공, 기존 pgTAP 25/25 무변경
  green(순수 추가 증명), append-only 트리거·RLS 차단·잔액/집계 뷰 psql 스팟 검증. coupon_ledger Realtime
  publication은 선례(T7/T10 — 소비 태스크에서 추가)대로 F5로 이월.

### F3a. 【DB】 상태머신·RPC 개정 + pgTAP 전면 개정 — 피벗의 심장 (DB 계층)
- 작업:
  ① `fn_charge_coupon(rider_id, qty, unit_price, purchase_id|null, memo, created_by)` /
  `fn_consume_coupon(rider_id, order_id, qty)` — revoke all + service_role만 GRANT(fn_post_ledger 패턴,
  20260704000003:16-51). fn_consume_coupon은 rider 단위 FOR UPDATE 직렬화 → 잔액 재계산 → 부족 시
  `raise exception 'INSUFFICIENT_COUPON'`.
  ② `fn_transition_order` 개정(20260704000006 최종본 기준):
  - ACCEPT 분기(51-69행): 조건부 UPDATE 성공 직후~order_events insert 이전에 **coupon_cost가 not null일
    때만** `perform fn_consume_coupon(...)` — 부족 예외 시 ACCEPT 전체 롤백 → 주문은 REQUESTED로 잔존.
    (order-accept Edge Function에 F3b가 추가할 사전 잔액 체크는 UX용 fail-fast일 뿐, 동시성 방어는 RPC가 유일한 진실.)
  - CONFIRM_MEASURE 분기(116-146행): EARN/HOLD perform 제거 → `cash_paid_amount`+`completed_at` 기록 +
    status='COMPLETED' 직행.
  - RESOLVE_DISPUTE 분기(**170-201행, 제거할 EARN/HOLD perform은 192-195행**): 1-3 재정의 — final_kg
    확정·고정 후 상태 **ARRIVED 복귀**(COMPLETED 아님). 이후 SUBMIT_MEASURE 재제출 거부 가드(중재 완료
    주문), CONFIRM_MEASURE는 중재 kg 기준으로 완료.
  - **FORCE_COMPLETE 신규 분기(D6)**: admin 전용, ARRIVED+계량(또는 중재) kg 존재 시에만. cash_paid_amount+
    completed_at 기록, memo 필수, order_events 기록.
  - CANCEL 분기(241-263행): admin 케이스(246행)를 **{ACCEPTED|ARRIVED|DISPUTED} 허용 + `p_fault` 필수**로
    확장 — SUPPLIER/SYSTEM이면 REFUND insert(멱등 패턴 20260704000008:65-73), 단 **REFUND 전 동일
    order_id+rider_id의 CONSUME 존재·qty 일치 확인(없으면 skip — 레거시 무근거 환급 방지)**. RIDER면 소진 유지.
    supplier 자진취소(242행)·시스템 만료(244행, order-expire 경로)는 무변경(쿠폰 미소진).
  - DELIVER 분기(203-231행): **레거시 주문(PICKED_UP 상태 잔존분) 완결용으로 보존**, 신규 주문은 도달 불가.
  ③ **pgTAP 전면 개정(추가가 아니라 재작성 — 기존 assert가 구모델을 검증하므로 그대로 두면 전부 파손)**:
  - 01_ledger_money_test: 픽스처 라이더에 fn_charge_coupon 선충전 추가(:28의 ACCEPT가 신 가드 통과하도록),
    CONFIRM 이후 assert(:32-52의 PICKED_UP/EARN 31500/HOLD 5000/DELIVER-RELEASE)를 신모델로 교체
    (COMPLETED 직행, cash_paid_amount·completed_at 기록, EARN/HOLD 부재). 쿠폰 원장 불변식 추가:
    append-only, CONSUME=coupon_cost, 잔액 부족 시 예외, 멱등 unique 2종.
  - 02_state_machine_test: admin CANCEL 케이스(:60-63)에 fault 인자 반영. 신 전이 추가: ARRIVED→COMPLETED,
    DISPUTED→ARRIVED 복귀, FORCE_COMPLETE, 귀책 환급 매트릭스(SUPPLIER/SYSTEM→REFUND, RIDER→없음),
    미소진(레거시) 주문 취소 시 환급 없음, 쿠폰 부족 시 ACCEPT 롤백(주문 REQUESTED 잔존).
  - **레거시 회귀 테스트 신설**: PICKED_UP 상태 직삽입 픽스처로 DELIVER 분기 생존 검증(프로덕션 잔존분 완결 보장).
  - 03_privilege_guards_test: coupon_ledger append-only·RLS 차단 케이스 추가.
- 동시성 검증 방법(명시): FOR UPDATE 직렬화는 pgTAP(단일 세션)로 재현 불가 → ⓐ pgTAP로는 "fn_consume_coupon
  내부에 FOR UPDATE+잔액 재계산 경로 존재·부족 예외"를 assert하고, ⓑ `scripts/`에 2-커넥션 psql 동시 수락
  스크립트를 두고 실측 결과를 태스크 완료 기록에 남긴다.
- DoD: pgTAP 전체 green(신모델 케이스 + 레거시 회귀 포함). 2-커넥션 동시성 실측 기록.
- [x] 결과(2026-07-09): 마이그레이션 2개(20260709000003 fn_charge_coupon/fn_consume_coupon — revoke all+
  service_role GRANT, rider FOR UPDATE 직렬화, CHARGE 부분유니크 멱등 / 20260709000004 fn_transition_order
  DROP+재생성 6-인자(p_fault 추가): ACCEPT 쿠폰 CONSUME, CONFIRM_MEASURE·FORCE_COMPLETE COMPLETED 직행,
  RESOLVE_DISPUTE ARRIVED 복귀, admin CANCEL 귀책 환급, DELIVER 레거시 보존). db reset 20개 적용 성공.
  pgTAP 전면 재작성 4파일 62/62 green(01 쿠폰 원장 불변식 15, 02 상태머신·귀책·부족 롤백 32, 03 쿠폰
  RPC EXECUTE·append-only 9, 04 레거시 DELIVER 회귀 6). 동시성 실측(scripts/concurrency-coupon-consume.sh):
  fn_consume_coupon 경합 → 1 성공+1 INSUFFICIENT_COUPON(잔액 0, CONSUME 1행), ACCEPT 경합 → 1 성공+
  1 23505(라이더 단일활성 유니크가 쿠폰 소진 전 2중 차단). lint/test/build FULL TURBO green(TS 무변경).
  01-db-schema.sql에 쿠폰 RPC 시그니처·fn_transition_order 개정 계약 주석 동기화.

### F3b. 【API】【core】 Edge Function·코어 개정
- 작업:
  ① order-create: coupon_cost 계산·스냅샷 추가, rider_fee 스냅샷 중지, estimatedPoint→estimatedCash 계약 개정.
  ② order-accept: 기존 가드 블록(index.ts:40-58)에 v_coupon_balance 사전 체크 추가(fail-fast) + **활성주문
  가드 상태 목록에 DISPUTED 포함**(idx_rider_single_active_order:299-300과 정합 — 현재 generic 409 나는 간극
  해소) + **mapTransitionError(index.ts:92-95)에 INSUFFICIENT_COUPON→409 매핑 추가**.
  ③ order-transition: fault 파라미터·FORCE_COMPLETE 액션 계약 + **notifyForAction(index.ts:94-150) 전면
  개정 — 1-6 알림 매트릭스대로**("포인트 지급"·"수거비 보류" 거짓 푸시 제거, 현금 확인 요청/완료/환급 카피).
  ④ **price-set: riderFee 계약 삭제** — priceSetInputSchema(packages/core/src/schemas.ts:192) 개정 +
  index.ts:35-42 insert에서 rider_fee 미기록. (누락 시 F10-①에서 시세 등록 전면 마비 — 필수 선행.)
  ⑤ 신규 Edge Function: `coupon-adjust`(admin 전용, point-adjust 패턴 복제 → fn_charge_coupon ADJUST),
  `coupon-price-set`(admin 전용, price-set 패턴 복제).
  ⑥ 【core】errorCodes.ts에 `INSUFFICIENT_COUPON`(409, "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요.") 추가.
  orderMachine.ts를 신 상태머신(1-3)으로 개정 — 레거시 전이(PICKED_UP/DELIVERED 경로)는 별도 함수로 분리 유지.
  couponSchemas(zod: purchase-intent/confirm/adjust/price-set 입출력) 추가. vitest.
- DoD: `pnpm lint/test/build` green. zod 계약 테스트. notifyForAction 분기 단위 테스트(신 카피).
  구버전 앱 호환 확인: 에러 응답 본문에 서버가 한국어 message를 담아 내려줌(_shared/response.ts:38-39의
  ERROR_MESSAGE_KO 자동 대입은 **서버 측** 동작이므로 구버전 번들에서도 표시 가능).
- [x] 결과(2026-07-09): Edge 6개 개정/신설(order-create couponCost·estimatedCash / order-accept DISPUTED
  가드+fail-fast+409 매핑 / order-transition FORCE_COMPLETE·fault·notify 매트릭스 전면 교체(순수 헬퍼
  buildActionNotifications 분리) / price-set riderFee 삭제 / coupon-adjust·coupon-price-set 신규).
  core: errorCodes 2종·estimateCash·orderMachine 신/레거시 분리·쿠폰 zod. 게이트 전체 green(테스트 505),
  클라이언트 .tsx 무수정 호환. ⚠️ F7 주의: estimateCash는 **(kg, pricePerKg) 시그니처로 구현됨**(F7-②의
  cans 기반과 다름 — F7은 estimateKg(cans, canSizeL)와 조합할 것). admin PricePage riderFee UI 잔존은
  서버가 무시(F10에서 제거).

### F4. 【API】【R】 PG 결제 연동 (토스페이먼츠) — 외부 의존: 가맹 심사
- 작업: ① `coupon-purchase-intent`(rider 전용): qty 검증(1~200) → 최신 coupon_price_ticks 스냅샷 →
  coupon_purchases PENDING 생성, pg_order_id 반환. ② `coupon-purchase-confirm`(rider 전용): 1-4의 잠금·검증·
  멱등 절차 그대로(FOR UPDATE→PENDING 재확인→토스 승인 API+amount 검증→fn_charge_coupon+PAID 동일 트랜잭션).
  성공 시 "쿠폰 N장 충전 완료" 알림 insert. ③ **orphan/미완료 대사**: 결제 화면 재진입 시 PENDING 건
  [결제 확인 재시도] 버튼(멱등 재호출), PENDING 24h TTL→EXPIRED(admin 대사 목록 노출). ④ 환불:
  admin 전용 `coupon-refund` — 1-4 환불 산정 규칙(구매 건 단위, unit_price 스냅샷, 미사용 잔액 검증,
  상태 기반 멱등, ADJUST(-qty, purchase_id)). **전용 RPC `fn_refund_purchase` 신설 필수** —
  fn_charge_coupon은 purchase_id 유무로 CHARGE/ADJUST를 라우팅하므로 "purchase_id 있는 ADJUST"를 기록할 수
  없다(F3a 보고). fn 내부에서 coupon_purchases FOR UPDATE + rider 직렬화 + 원장 insert를 원자 처리. ⑤ 라이더앱 결제 화면: 토스 결제위젯(클라이언트 키), 수량
  선택(10/30/50장 프리셋+직접 입력), 성공/실패/중단 리다이렉트 처리. ⑥ 시크릿 키는 supabase secrets —
  클라이언트 번들 유입 금지 검증(grep).
- 주의: 가맹 심사 완료 전 로컬은 토스 테스트 키로 개발 가능. 심사는 즉시 착수(외부 의존 항목).
- DoD: 테스트 키 E2E(intent→위젯→confirm→잔액 증가+충전 알림). 금액 위변조 거부. **confirm 미호출 후
  재진입 재시도 시 잔액 정상 반영(이중 적립 없음)**. 상이 단가 2건 구매 후 부분 환불 시나리오(환불액=해당 건
  단가 기준, 잔액 차감). `pnpm lint/test/build` green.
- [x] 결과(2026-07-09): 마이그레이션 20260709000005(fn_confirm_purchase/fn_refund_purchase — revoke all+
  service_role, coupon_purchases FOR UPDATE 상태 기반 멱등, rider 원장 FOR UPDATE 직렬화 후 잔액 재계산;
  fn_charge_coupon이 못 하는 "purchase_id 있는 ADJUST"를 fn_refund_purchase가 담당·F3a 경계 해소). Edge 3
  신설: coupon-purchase-intent(최신 tick 스냅샷·PENDING insert·pg_order_id `oc_<uuid>`), coupon-purchase-
  confirm(소유/pgOrderId·amount 위변조 검증 → 토스 승인(RPC 밖) → fn_confirm_purchase 원자 확정; PAID 멱등,
  ALREADY_PROCESSED 멱등, 승인후 확정실패 시 토스 취소+FAILED), coupon-refund(fail-fast 잔액 → 토스 취소 →
  fn_refund_purchase; 취소 실패 시 원장 무변경). `_shared/toss.ts`(confirm/cancel, fetch 주입 — deno test 4
  green, 네트워크 없이 검증). core: couponPurchaseIntent/Confirm/Refund zod + PAYMENT_FAILED(402) + vitest 10.
  rider `/coupons/purchase`(수량 10/30/50·직접입력, 예상금액=단가×수량, intent→SDK 위젯(주입/모킹)→successUrl
  confirm, PENDING 대사+재시도; TOSS_CLIENT_KEY env). pgTAP 05 신설 21(confirm PENDING→PAID+CHARGE 멱등·
  이중confirm·FAILED거부 / refund PAID만·건당1회·qty상한·미사용잔액부족·ADJUST -qty·unit_price 스냅샷·PG환불
  구분·롤백) + 03에 EXECUTE 가드 3 → **db reset 21개 마이그레이션 + pgTAP 5파일 86 green**. deno check 4함수·
  lint·turbo test(rider 8 신규)·build FULL green. 시크릿 격리 grep: TOSS_SECRET_KEY는 _shared/toss.ts의
  Deno.env만, rider 번들엔 클라이언트 키만(dist 리터럴 0). **실 토스 위젯 브라우저 E2E는 가맹/테스트 키
  미발급으로 보류** — .env.example(VITE_TOSS_CLIENT_KEY)·DEPLOY.md(TOSS_SECRET_KEY supabase secrets) 문서화.

## P2 — 라이더앱 (매입자 전환)

### F5. 【R】 쿠폰 지갑 + 수락 게이트 UX
- 작업: ① CallHomePage 상단에 쿠폰 잔액 카드(v_coupon_balance 조회 + coupon_ledger Realtime insert 구독,
  EarningsPage의 PointBalanceCard 패턴 재활용) + [충전하기] → 결제 화면(F4-⑤). ② 쿠폰 내역 화면
  (CHARGE/CONSUME/REFUND/ADJUST 리스트 — LedgerList 컴포넌트 일반화 재사용). ③ CallCard/CallDetailPage에
  "쿠폰 N장 소진"(coupon_cost) 표시, "수거비" 표기 제거 → "예상 매입 지급액"(requested_kg×시세)으로 교체
  (packages/ui CallCard.tsx:87-94, CallDetailPage.tsx:130-133). ④ 수락 실패 INSUFFICIENT_COUPON 시 토스트 +
  [충전하러 가기] CTA(CallDetailPage.tsx:26-40 기존 에러 패턴 확장). ⑤ 수락 전 잔액 사전 체크 UI(fail-fast).
- DoD: 잔액 0 → 수락 버튼에 충전 유도. 충전 → 수락 → 잔액 감소 실시간 반영. 훅/렌더 vitest.
- [x] 결과(2026-07-09): 마이그레이션 20260709000006(coupon_ledger Realtime publication — point_ledger
  선례 복제) + 01 Realtime 주석 동기화. 훅: useCouponBalance(v_coupon_balance 조회 + coupon_ledger
  INSERT 구독→잔액·내역 무효화, usePointBalance 미러)·useCouponLedger(coupon_ledger→LedgerEntry, qty→amount).
  【ui】 일반화: LedgerList `variant="coupon"`(CHARGE 충전/CONSUME 콜 배정/REFUND 환급/ADJUST 조정 + 장 단위,
  기본 point 무영향)·PointBalanceCard `label`/`formatValue`/`onClick`(쿠폰 잔액 히어로 + 카드 탭)·CallCard
  `pickupFee`→`estimatedCash`+`couponCost`(쿠폰 N장 소진 칩, 레거시 null 생략). 【R】 CallHomePage 상단
  쿠폰 잔액 카드([충전하기]→/coupons/purchase, 카드 탭→/coupons) + CallCard 매입액/쿠폰 표기. 신규
  `/coupons` 쿠폰 내역 화면(EmptyState). CallDetailPage: 수거비 히어로→"예상 매입 지급액"(requested_kg×시세)+
  소진 쿠폰, 수락 게이트(잔액<coupon_cost 사전 fail-fast CTA + 409 INSUFFICIENT_COUPON 토스트+CTA, edgeFunction
  실패에 code 노출). db reset 22개 + pgTAP 5파일 86/86 green(publication 무영향), lint·turbo test
  --concurrency=1(rider 33·ui 신규 포함)·build FULL green. CallCard 회귀: DevUiPage 사용처 갱신, CallCard.test
  재작성(레거시 null 생략 포함). 보류: 실 브라우저 E2E(잔액 감소 실시간 반영은 useCouponBalance 훅 단위
  테스트로 대체 — Realtime 서비스 컨테이너 stopped).

### F6. 【R】 운행 플로우 개편 — 현금 매입
- 작업: ① ArrivedPanel(ActiveRunPage.tsx:228-392): "예상 지급 포인트" → **"점주에게 지급할 현금 ₩N"**
  (계산식 kg×snapshot_price 동일, 라벨·단위만 원화). 제출 버튼 카피 "계량 제출 → 사장님 확인 요청".
  제출 후 안내: "사장님께 현금 ₩N을 지급하고 앱 확인을 요청하세요". ② PickedUpPanel/QR 스캔
  (ActiveRunPage.tsx:395-498): 신규 주문 플로우에서 제거. 레거시 상태(PICKED_UP) 주문에만 조건부 렌더 유지.
  ③ **DISPUTED 안내 패널 신설**: useActiveRun(useActiveRun.ts:24 RUN_STATUSES)에 DISPUTED 포함 — 분쟁 중
  라이더가 빈 화면+수수께끼 409에 갇히는 기존 간극 해소("사장님 이의신청 접수 — 관리자 중재 대기 중").
  ④ 완료 화면: "수거 완료 — 현금 ₩N 지급" 요약. ⑤ EarningsPage → **"수거 실적" 페이지로 재정의**:
  이번 달 수거 kg/건수/현금 지급 총액(**completed_at 기준**, 레거시 coalesce 규약은 F2-⑤) + 쿠폰 소진/충전
  요약. 출금 신청 UI(EarningsWithdrawPage) 라우트 제거. ⑥ CallHomePage today-stats를 수거 kg/지급 현금/
  소진 쿠폰으로 교체(completed_at 기준).
- DoD: 수동 시나리오(요청→수락→도착→계량→확인→완료)를 단계별로 실행하고 각 단계 결과를 태스크 완료
  기록에 남김 — 신규 주문이 QR 없이 완결, DISPUTED 패널 표시, 레거시 PICKED_UP 주문 QR 경로 잔존.
  스냅샷·훅 vitest 갱신.
- [x] 결과(2026-07-09): 【R】 ActiveRunPage 현금 매입 전환(ArrivedPanel "점주에게 지급할 현금"+제출 카피,
  중재완료(final_kg) 재제출 불가 패널, DISPUTED 안내 패널 신설, COMPLETED 요약 패널+콜홈 복귀, 레거시
  PICKED_UP QR 분기·스캔 보존). useActiveRun RUN_STATUSES에 DISPUTED/COMPLETED 추가(+final_kg/coupon_cost/
  cash_paid_amount/completed_at 컬럼, COMPLETED 30분 창 post-filter). useTodayStats 신모델 교체(수거 kg/지급
  현금/소진 쿠폰, completed_at) + useMonthlyPickupStats 신설(이번 달 건수/kg/현금, coalesce 규약·레거시혼합).
  EarningsPage→"수거 실적" 재정의(포인트/출금 UI 제거, 이번 달 현금/건수/kg + 쿠폰 요약 + 내역/충전 링크),
  탭 라벨 "정산"→"실적", /earnings/withdraw 라우트·네비 제거(EarningsWithdrawPage·useEarnings 참조 0 고아→F13
  삭제). CallHomePage today-stats 교체. CallDetailPage not-found ErrorScreen(E2 이월). 브라우저 E2E 불가 →
  상태별 렌더/훅 vitest 전수(rider 48, 신규 ActiveRunPage 7·EarningsPage 4·useTodayStats 2 + CallHome/
  CallDetail 회귀 갱신) + F3a pgTAP(전이 실증) 조합으로 대체. lint·turbo test(--concurrency=1)·build FULL green.
  신규 경로 포인트/수거비 표기 0건(잔존은 주석·레거시 데이터 필드·고아 파일뿐).

## P3 — 유저앱 (시세 중심 프리미엄 리디자인)

### F7. 【core】【ui】 차트·토큰 기반 공사
- 작업: ① 【core】`priceResample.ts` 신설 — PricePage.tsx:25-49의 private resample()을 승격한
  `resampleDaily(ticks, days)`: 종가+캐리포워드(1-5 규칙), 반환 `[{date, price}]`. 단위 테스트
  (무tick일/하루 다건/희소 데이터). ② 【core】`estimate.ts` — `estimateCash(cans, pricePerKg)` 추가,
  estimatePoint는 deprecated 별칭(F13에서 제거). ③ 【U】`usePriceTicksSince(days: 7|30|90)` —
  `effective_at >= now()-interval` 범위 쿼리(limit 방식은 30개≠30일이라 폐기). ④ 【ui】`PriceChart.tsx`
  신설 — 순수 SVG(라인 path + linearGradient 영역 상단 opacity .18→0), viewBox 340×180, 등락 방향이
  stroke 색 지배(기존 up/down 토큰), 포인터 스크럽(x→인덱스 역산, 세로 가이드+날짜·값 툴팁,
  `touch-action: pan-y`), 차트 드로인 stroke-dashoffset 600ms. recharts 등 라이브러리 추가 금지(기존
  Sparkline PriceCard.tsx:20-67 좌표 패턴 확장). ⑤ 【ui】기간 세그먼트 토글(7/30/90일, radius.pill 트랙+
  슬라이딩 인디케이터 200ms, 터치 타깃 48px, 기본 30일). ⑥ 【ui】tokens.ts 확장(05 문서 동기화):
  `surfaceDark {hero:'#133A26', heroDeep:'#0B2317', textOnDark:'#FFF', textOnDarkMuted:'rgba(255,255,255,0.64)'}`,
  `gradient.heroDeep`, `colors.chart {lineOnDark:'#4ADE9B', areaTop:'rgba(74,222,155,0.20)'}`,
  `typeScale {display:40, headline:28, title:20, body:16, label:13, caption:12}`,
  `motion {fast:150ms, base:250ms, slow:400ms, ease:cubic-bezier(0.2,0.8,0.2,1)}`, `elevation.heroDark`.
  기존 그린의 명도 축 확장이므로 리브랜딩 아님. 모든 모션은 `prefers-reduced-motion` 존중.
- DoD: resampleDaily/estimateCash/PriceChart/토글 단위 테스트. DevUiPage에 PriceChart 목업 추가(06 구현 규칙 2).
- [x] 결과(2026-07-09): 【core】priceResample.ts(resampleDaily 종가+캐리포워드+KST 경계 교정, dailyChange 전일종가 헬퍼) / 【U】usePriceTicksSince(7·30·90 범위쿼리+Realtime, 기존 훅 보존) / 【ui】PriceChart(순수SVG 라인+그라디언트 영역, 등락색/민트 override, 포인터 스크럽+onScrub, 드로인 600ms·reduced-motion) + SegmentToggle(범용, radius.pill 슬라이딩 200ms, roving tabindex 키보드) / tokens.ts 확장(surfaceDark/gradient.heroDeep/colors.chart/typeScale/motion/elevation.heroDark) + 05 신규 토큰 절. DevUiPage 다크 히어로 목업(스크럽 시 상단 숫자 치환). ②estimateCash는 F3b 선반영(kg,pricePerKg)이라 미변경. 소비처(PricePage/PriceCard) 무변경—전환은 F8. lint/turbo test(--concurrency=1, resampleDaily 10·usePriceTicksSince 2·PriceChart 6·SegmentToggle 5 신규)/build FULL green.

### F8. 【U】 홈·시세 화면 전면 리디자인 — 일별 시세 히어로가 주인공
- 작업: HomePage.tsx 재작성. 정보구조(위→아래):
  ① **다크 시세 히어로**(gradient.heroDeep, radius.hero, elevation.heroDark): 라벨 "오늘 매입가"(13px muted) →
  현재가 40px/800/순백/tabular-nums + "원/kg" → 등락 pill(일별 종가 대비, 다크 위 화이트 10% pill) →
  PriceChart(높이 160, 민트 라인) → 기간 토글. 가격 카운트업 400ms. 스크럽 중 상단 숫자가 해당 일 값으로 치환.
  카드 전체 탭 아님 — "시세 상세" 텍스트 링크만 /price로(스크럽 제스처 충돌 방지).
  ② 진행중 주문 카드(기존 좌측 그린 바 패턴 유지). ③ 현금 수령 요약 1줄 카드(이번 달 수령 ₩N —
  cash_paid_amount 합·completed_at 기준, 탭→수령 이력). ④ 최근 수거 이력 2건. ⑤ 하단 fixed CTA
  "수거 요청하기"(탭바 위, safe-area).
  ⑥ **PricePage(/price) 본체도 동일 체계로 교체** — PriceChart+resampleDaily+기간 토글(홈 히어로와 동일
  컴포넌트, 내부 resample private 로직 삭제) + 이력 테이블 유지. 히어로에서 진입한 상세가 구 디자인으로
  남으면 톤앤매너가 깨짐.
  - 홈의 QtyStepper+예상포인트 섹션(HomePage.tsx:118-145)은 **제거** — RequestPage step1로 일원화.
  - WalletPage/WithdrawPage/PointBalanceCard 라우트 제거 → "수령 이력" 화면(주문별 현금 수령 리스트)으로 대체.
    탭바 "포인트" 탭 → "수령액" 탭으로 개명(E1의 AppShell 위에서 작업).
  - 7일 뷰에서 tick 2개 미만이면 차트 대신 현재가만(빈 상태 설계). 다크 위 muted 텍스트는 라벨 전용,
    수치는 순백(50대 타깃 대비 4.5:1, 03-frontend 16px+/48px 원칙 유지).
- DoD: 홈 최상단이 일별 차트 히어로(스냅샷 테스트). 스크럽/토글 동작 테스트. /price가 동일 차트 체계.
  하드코딩 색상 0건(토큰만). 탭 왕복(E1 회귀) green.
- [x] 결과(2026-07-09): 【U】HomePage 전면 재작성(헤더+알림벨/이력 → 다크 시세 히어로(현재가 40px 순백·
  카운트업 400ms·스크럽 시 상단 숫자·날짜 치환·전일대비 pill·PriceChart 민트·7/30/90 토글 기본30) →
  진행중 주문 카드 → 이번 달 현금 수령 요약 → 최근 이력 2건 → 하단 fixed "수거 요청하기"; QtyStepper+
  예상포인트 섹션 제거). PricePage recharts 폐기→홈과 동일 PriceChart+resampleDaily+SegmentToggle 히어로+
  이력 테이블(수거비 열 제거). WalletPage→"수령 이력"(이번달 수령 히어로+주문별 리스트), /wallet 경로 재사용·
  /wallet/withdraw 라우트 제거. UserShell 탭 "포인트"→"수령액". 신규 useCashReceipts(useMonthlyCashReceipt+
  useCashReceipts, 레거시 coalesce 규약). 빈 상태(일별<2점) 캡션. 【ui】surfaceDark에 pill/skeleton 토큰
  추가(05 동기화) — 신규 코드 하드코딩 색상 0(grep). recharts를 apps/user/package.json+lockfile에서 제거
  ('charts' 청크 소멸). vitest: user 95 green(신규 HomePage 10·PricePage 5·WalletPage 3·useCashReceipts 3 +
  App "수령액"/E1 회귀). lint·turbo test(--concurrency=1)·build FULL green. /dev-ui 브라우저 육안 확인.

### F9. 【U】 수거 요청 플로우 고도화 + 현금 카피 전환
- 작업: 3스텝 골격 유지 + ① 전 스텝 공통 sticky **예상 수령액 푸터**(원화, cans 변경 실시간, "현장 계량 기준
  확정" 캡션). ② 최근 주소 재사용 칩 2개(본인 완료 주문 주소 distinct — RLS로 조회 가능, 스키마 무변경).
  ③ 통 크기 프리셋(18L 말통/10L/기타 → estimateKg(cans, canSizeL) 확장 — **coupon_cost 공식에는 무영향,
  D2 참조**). ④ 희망시간 퀵칩(지금/오늘 오후/내일 오전/직접). ⑤ 제출 성공 ConfirmSheet(워킹트리 신규
  컴포넌트 재사용) + 주문 상세 이동. 스텝 인디케이터(1/2/3). ⑥ 카피 전환 전수: "예상 포인트"→"예상 현금
  수령액"(P→원). OrderDetailPage — CONFIRM 버튼을 **"무게 OO.Okg 확인 · 현금 ₩N 받았습니다"** 카피로
  (2자 확인=현금 수령 증빙의 핵심), COMPLETED 히어로를 포인트→현금 수령액으로.
  ⑦ **주문 진행 UI의 신 경로 반영**: 【ui】OrderTimeline HAPPY_PATH(OrderTimeline.tsx:12-18)를
  [REQUESTED, ACCEPTED, ARRIVED, COMPLETED]로 교체 + 레거시 주문(picked_up_at/delivered_at 존재)은 구경로
  조건부 렌더. StatusHeadline의 PICKED_UP/DELIVERED 항목(StatusHeadline.tsx:40-44,72-73)과
  ORDER_STATUS_LABEL "수거 완료/배송 완료"(packages/core/src/constants.ts:23-24)를 레거시 전용으로 정리.
  공용 컴포넌트이므로 rider 화면 회귀 확인 포함.
- DoD: 수동 시나리오(요청→수락→계량→확인→COMPLETED)를 단계별 기록 — 전 구간 포인트 표기 0건(전부 원화),
  타임라인에 PICKED_UP 스텝 미표시(신규 주문). 폼/훅 vitest. 스냅샷 갱신.
- [x] 결과(2026-07-09): 【U】RequestPage 3스텝 골격 유지 + ①전스텝 sticky 예상 현금 수령액 푸터(cans/통 크기 실시간·"현장 계량 기준으로 확정돼요") ②최근 주소 재사용 칩 2건(신규 useRecentAddresses — 완료주문 distinct, pickup_location GeoJSON 파싱 재사용) ③통 크기 프리셋 18L/10L/기타(kg 직접) ④희망시간 퀵칩 지금/오늘 오후/내일 오전/직접 ⑤제출 성공 ConfirmSheet([주문 상세]/[홈으로]) + 1/2/3 도트·라벨 인디케이터. 【core】estimateKg(cans, canSizeL?) 확장(18L=15kg 유지·10L 비례·소수1자리, estimateCash 시그니처 무변경) + CAN_SIZE_L_DEFAULT. ⑥현금 카피 전수: RequestPage/OrderDetailPage(InfoStat "예상 수령액", CONFIRM "무게 OO.Okg 확인 · 현금 ₩N 받았습니다", COMPLETED 현금 히어로 cash_paid_amount, 중재 후 ARRIVED 복귀 카피)·OnboardingPage·OrdersHistoryPage·DevUiPage(useOrder/useOrderHistory에 cash_paid_amount/coupon_cost/completed_at 추가). ⑦【ui】OrderTimeline HAPPY_PATH 4스텝[REQUESTED,ACCEPTED,ARRIVED,COMPLETED]+legacy 5스텝 조건부(currentStatus PICKED_UP/DELIVERED 자동 레거시)·StatusHeadline COMPLETED 현금 카피·PICKED_UP/DELIVERED 레거시 표기·ORDER_STATUS_LABEL 레거시 주석. lint·turbo test(--concurrency=1)·build FULL green(core 354/ui 83/user 104/rider 51/admin 19). user 앱 표시문자열 포인트 잔존 0(레거시 렌더 분기·deprecated WithdrawPage 제외). 공용 OrderTimeline rider 회귀 green(ActiveRunPage PICKED_UP 자동 레거시). 실 브라우저 E2E 불가 → 요청→수락→계량/중재→확인→COMPLETED 화면 상태 컴포넌트 테스트로 전수 대체.

## P4 — 관리자앱 (운영·통계·CS)

### F10. 【A】 쿠폰 운영 + 매출 통계
- 작업: ① PricePage에 쿠폰 단가 섹션 추가(현재 단가+coupon-price-set 폼+이력 — 기존 tick UI 패턴 재사용).
  rider_fee 입력 필드 제거(**서버 계약 개정은 F3b-④에서 선행 완료 — 여기서는 UI만**). ② UsersPage 라이더탭:
  쿠폰 잔액 컬럼 + [수동 조정] 모달(coupon-adjust, 사유 필수) + 충전/조정 이력. ③ SettlementPage →
  **"매출·정산" 재편**: 쿠폰 매출 대시(v_coupon_sales_daily — 일별 판매액/장수/환불 구분), **수거 활동 추이
  (v_pickup_stats_daily — 일별 건수/kg/현금 거래액, 매출과 상관 확인용)**, 쿠폰 원장 감사 테이블,
  결제(coupon_purchases) 목록(EXPIRED 대사 포함) + 환불 처리(coupon-refund). 기존 출금 큐 UI 제거(포인트 폐기).
  ④ DashboardPage KPI 교체: 오늘 주문/수거 kg/**쿠폰 판매액**/**소진 쿠폰**/활성 라이더 + **현금 거래액**
  (completed_at 기준). ⑤ OrdersPage 드로어: coupon_cost·환급 여부·cash_paid_amount 표시, admin 취소 시
  **귀책 선택 UI**(D4 — SUPPLIER/RIDER/SYSTEM + 각 의미 설명, 환급 결과 안내), **FORCE_COMPLETE 버튼**
  (D6 — 계량 제출된 ARRIVED 한정, 사유 입력). ⑥ CSV 내보내기(06 E10-③ 유틸)를 쿠폰 원장/매출/주문에 적용.
- DoD: 단가 설정→라이더 구매 금액 반영 E2E. 귀책 취소→환급 매트릭스 3케이스(SUPPLIER/SYSTEM→환급+
  라이더 "쿠폰 N장 환급" 알림 발송, RIDER→없음) UI 검증. FORCE_COMPLETE 동작. 매출 수치가 원장 합계와
  일치(테스트). 스냅샷 갱신.
- [x] 결과(2026-07-09): 【A】①PricePage 쿠폰 단가 섹션(현재 단가 카드+coupon-price-set 폼+이력, 기존 tick
  패턴)+rider_fee 입력 제거(이력 "수거비(레거시)" 열만 유지, useCouponPriceHistory 신설) ②UsersPage 라이더탭
  RiderCouponPanel(잔액 v_coupon_balance Map join + [수동 조정] 모달 memo 필수·INSUFFICIENT_COUPON 안내 +
  라이더별 coupon_ledger 이력, RiderVerifyCard footer 슬롯) ③SettlementPage→"매출·정산"(v_coupon_sales_daily
  14일 대시+합계 카드/v_pickup_stats_daily 수거 추이/쿠폰 원장 감사 100건 entry_type 라벨·PG환불 배지/
  coupon_purchases status 필터+EXPIRED 대사 안내+[환불] 부분 qty·건당 1회 카피; 출금 큐·point_ledger UI 제거 —
  useSettlementAdmin 라우트 참조 0, 파일 삭제는 F13) ④Dashboard KPI 6종 교체(쿠폰 판매액/소진 쿠폰/현금
  거래액 completed_at 기준, "오늘 발행 포인트" 제거) ⑤드로어 coupon_cost·환급됨 배지(REFUND 원장 조회)·
  cash_paid_amount + 귀책 취소 라디오 3종(의미 설명+환급 예고 "쿠폰 N장 자동 환급"/"환급 없음", 미선택 비활성,
  {ACCEPTED|ARRIVED|DISPUTED}) + FORCE_COMPLETE(계량 ARRIVED 한정·memo 필수) + RESOLVE_DISPUTE "ARRIVED
  복귀·점주 확인 필요" 카피 교정 ⑥CSV 유틸(toCsv BOM·RFC4180 이스케이프/downloadCsv 분리)→원장/일별 매출/주문
  3곳. admin vitest 62(신규 lib 7·PricePage 8·RiderCouponPanel 7·Settlement 12·Dashboard 2+2·드로어 17·CSV 버튼)
  green — 매출 정합 테스트(mock 원장→aggregateCouponSalesDaily(뷰 SQL 미러)→합계=CHARGE 합·§1-4 환불 구분
  일치) 포함. lint·turbo test --concurrency=1·build 전체 green. admin 표시 문자열 "출금/포인트" 잔존 0(주석·
  부재 검증 테스트만). 보류: 실 브라우저 E2E(단가 설정→구매 반영, 환급 알림 발송)는 로컬 Supabase/PG 키 제약으로
  컴포넌트 테스트+F3a/F4 pgTAP(전이·환급·알림 RPC 실증) 조합으로 대체.

### F11. 【A】【R】【DB】 라이더 관리 강화 — 정지·서류 필수화·인계처 (규제 게이트)
- 작업: ① SUSPENDED(F2-⑦): rider-verify Edge Function에 suspend/reinstate 액션 추가(guard_rider_verify
  트리거 예외 경로 그대로), 정지 시 is_online 강제 false + 정지/해제 알림(1-6). open_calls RLS·order-accept
  가드는 APPROVED 체크라 자동 차단됨(검증 테스트로 증명). UsersPage에 [정지]/[해제] + 사유. ② 서류 요건
  강화: doc_permit_url을 "폐기물처리(수집·운반) 신고증명서"로 라벨 확정 + **필수화** — rider-verify 승인 시
  서버 검증(없으면 승인 거부), 라이더 VerifyPage 업로드 필수 표시 + 안내 카피("정부24 '폐기물처리 신고' —
  처리 약 14일"). 사업자등록증은 기존 필수 유지. ③ rider_profiles에 `recycler_name/recycler_contact`
  (인계 재활용업체) 추가 — 승인 조건 텍스트 필드(D5 전제), UsersPage/VerifyPage 반영.
- 주의: **법률 검토(변호사/환경부 질의) 결과에 따라 요건 수위 조정 가능** — 착수 전 D5 확정 필수.
- DoD: 신고증명서 없는 승인 시도 → 거부. SUSPENDED 라이더 콜 조회/수락 불가(RLS+가드 테스트) + 통지 발송.
  마이그레이션+01 동기화.
- [x] 결과(2026-07-09): 마이그레이션 2개(20260709000008 recycler_name/contact / 20260709000009
  fn_transition_order ACCEPT에 verify_status='APPROVED' 게이트 — RIDER_NOT_ELIGIBLE, 진행 전이는 무게이트
  =정지 시 진행중 주문 완결 허용). rider-verify에 SUSPENDED/REINSTATED 액션(사유는 reject_reason 재사용,
  정지 시 is_online 강제 false, §1-6 정지/해제 sendPush) + approve 시 doc_permit_url·recycler 서버 필수
  검증(400 VALIDATION_ERROR). order-accept mapTransitionError에 RIDER_NOT_ELIGIBLE→403 추가. UI: admin
  RiderVerifyCard [정지]/[해제]+사유·신고증명서 필수뱃지·인계처 표시, rider AuthPage(서류 업로드 화면)
  신고증명서 필수화+정부24 카피+인계처 입력. pgTAP 07 신설 9(SUSPENDED open_calls 0행/ACCEPT 거부·
  REQUESTED 잔존/PENDING 거부/APPROVED 대조군+CONSUME/정지 후 ARRIVE 허용/셀프 해제 변조 차단) →
  7파일 104/104 green. vitest 신규 11(admin RiderVerifyCard 7+rider AuthPage 4), lint/test/build 전체
  green, deno check(rider-verify·order-accept, vendor 재생성). 02-api.md §6 suspend/reinstate 개정,
  01 예약 마커 실 DDL 교체. ⚠️ 00-domain.md:121 "허가증은 선택"은 F11-② 필수화와 상충 — 문서 수정
  허용 범위 밖이라 보고로 이월.

### F12. 【A】【U】【R】【DB】 CS 1차 — 문의 티켓
- 작업: ① `cs_tickets(id, author_id FK, role, category enum('ORDER','CASH_DISPUTE','COUPON_PAYMENT',
  'ACCOUNT','ETC'), order_id nullable FK, title, body, status enum('OPEN','IN_PROGRESS','RESOLVED'),
  admin_reply, created_at, resolved_at)` — RLS: 본인 select+insert(author_id=auth.uid() 강제), admin 전체
  select/update. 원장류가 아니므로 클라이언트 insert 허용(무결성 리스크 없음). **CASH_DISPUTE = 현금 지급
  후 분쟁 전용(1-3 — 상태머신 밖 수용처. 라이더 "확인 안 해줘요"/점주 "돈 못 받았어요")**. ② admin 신규
  /cs 페이지: 상태 필터 큐 + 답변 폼 + 주문 링크(OrdersPage 드로어 연동 — CASH_DISPUTE는 FORCE_COMPLETE/
  귀책 취소로 처치 가능). 답변 시 notifications insert(기존 알림 인프라 재사용). ③ user/rider MyPage의
  "고객센터" placeholder를 실 문의 폼+내 문의 내역으로 교체. 라이더 ActiveRun DISPUTED/교착 화면에서
  CASH_DISPUTE 바로 접수 진입점. ④ 쿠폰 환불 요청은 category=COUPON_PAYMENT로 접수 → F10-③ 환불 처리와
  연결. ⑤ **ARRIVED 24h 초과 체류 주문을 OrdersPage에서 하이라이트**(교착 조기 감지 — 1-3).
- DoD: 문의 접수→admin 답변→알림 수신→상태 RESOLVED E2E. RLS(타인 티켓 불가시) 테스트. 24h 하이라이트 렌더 테스트.
- [x] 결과(2026-07-09): ① 20260709000007_cs_tickets.sql(cs_category/cs_status enum + cs_tickets + fn_current_role helper + RLS p_cs_read/p_cs_insert(author·role 위조 차단)/p_cs_admin_update + 컬럼 GRANT로 답변·상태만) + 01 마커 실 DDL 교체. ② admin /cs(CsPage+useCsAdmin, AdminShell "CS" 내비, 답변=cs-reply Edge Function이 admin_reply+status+resolved_at+sendPush 원자 처리, CASH_DISPUTE 처치 안내+주문 드로어 딥링크 /orders?order=, COUPON_PAYMENT→/settlement) + OrdersPage 24h 체류 하이라이트(order_events ARRIVED 진입시각 기준, isArrivedStale). ③ user·rider /support(문의 폼+내역, MyPage placeholder 교체, csTicketInputSchema) + rider DISPUTED 패널 CASH_DISPUTE 프리셋 진입점. ④ COUPON_PAYMENT→SettlementPage 환불 연결. 검증: pgTAP 95개(신규 cs_tickets RLS 9) green, lint+test(모든 앱)+build green. 알림 경로: admin 클라이언트 notifications 직접 insert 불가(RLS insert 정책 없음 확인) → cs-reply Edge Function이 기존 sendPush 재사용.

### F13. 【정리】 레거시 일몰
- 작업: ① withdraw-request/withdraw-process/point-adjust Edge Function **코드 삭제 + 프로덕션 undeploy**
  (화면·라우트 제거는 F6-⑤/F8에서 완료 — 여기서는 잔존 참조 없는지 확인만). ② DepotsPage 라우트 숨김 +
  depots 신규 등록 차단(테이블·데이터 보존). ③ qa-checklist.md 🔴 "카메라 QR 스캔" 항목 제외 처리(대상
  플로우 소멸). ④ 데모 시나리오 문서/시드(seed.sql) 신모델로 갱신(쿠폰 선충전 포함). ⑤ 미사용 심볼 제거
  sweep — **grep 대상 목록**: `estimatePoint`, `PointBalanceCard`, `WalletPage`, `WithdrawPage`,
  `EarningsWithdrawPage`, `withdraw-request`, `withdraw-process`, `point-adjust`, `formatPoint`,
  `WITHDRAW_REQUEST`(UI 라벨), `snapshotRiderFee`(신규 코드 경로) — 각각 참조 0 확인 후 제거, 결과를 완료
  기록에 남김(레거시 렌더 분기가 쓰는 것은 예외 명시).
- DoD: `pnpm lint/test/build` green. 위 grep 목록 전수 결과 기록(잔존 시 사유 명시).

---

## 06 백로그 판정 (F1에서 06 문서에 반영)

| 06 태스크 | 판정 | 근거 |
|---|---|---|
| E1 탭바 / E2 ErrorScreen / E4 프로필수정 / E5 ConfirmSheet | **유지 — F1 착수 전 독립 커밋으로 먼저 완료** | 워킹트리 진행 중, 모델 중립. F8이 AppShell 위에서 작업하므로 선행 필수 |
| E3 콜 포그라운드 알림 | 유지 (F5와 병행 가능) | 신모델에서도 매칭률 핵심 |
| E6 Toast / E7 미읽음 배지 / E9 운행 히스토리 | 유지 | 모델 중립 |
| E8-① 출금현황 카드 | **폐기** | 라이더 수거비·출금 소멸(D1). F6-⑤가 대체 |
| E8-② QR 재스캔 | **폐기** | DELIVER 단계 소멸 |
| E8-③ 사진 진행률 / ④ 사장님 전화 | 유지 | 현장 계량 플로우 존속 |
| E10-①③④ (주문 검색/CSV/시세 정정배너) | 유지 | F10-⑥이 CSV 흡수 |
| E10-② 출금큐·원장 필터 | **대체** | 대상을 쿠폰 매출·충전 이력으로(F10-③) |
| E11 홈 히어로+스파크라인 | **폐기 → F7/F8로 승격 흡수** | 앰버 예상포인트 히어로는 구모델 전제 — 그대로 만들면 100% 재작업 |
| E12 rider 뼈대 3종 디자인 | 유지 (카피만 신모델 정합) | |

## 스코프 제외 / 외부 의존 (코드로 해결 불가 — 즉시 착수 권장)
- **법률**: ① 환경부/관할 지자체 서면 질의 — "폐기물처리 신고 완료 개인사업자 라이더에게 수거 콜을 중개하는
  행위"의 적법성(질의회신 선례 풍부, 최저비용 헤지). ② 전금법 로펌 서면 검토 1회(쿠폰=자기 용역 전용 설계
  확정본 기준). ③ 쿠폰 판매 약관(환불·유효기간·청약철회, 전상법). ④ 대형 배출처(사업장폐기물)는 **MVP 대상
  제외 확정**(신고제 범위 밖 — 수집·운반업 허가 영역).
- **세무(세무사 확인 필수)**: 라이더 사업자등록 필수화 온보딩, 조특법 §108 재활용폐자원 매입세액공제(3/103)
  안내, 앱 거래명세서 자동 생성(라이더 매입 증빙+점주 매출 기록 지원 — 차별화 기능 후보, P2 이후).
- **PG**: 토스페이먼츠 가맹 심사(F4 전 착수, 테스트 키로 개발 병행). 통신판매업 신고(정부24, 저비용).
- 기존 항목 유지: 실 SMS, FCM 서비스계정, 카카오맵 실키, 실기기 검증(qa-checklist 🔴).

## 리스크 레지스터 (요약)
- [상] 무신고 라이더 수거·운반 = 라이더 2년 이하 징역/2천만원 벌금 + **점주(고객)도 처벌 가능** + 플랫폼 방조
  리스크 → F11 게이트가 유일한 차단선. [상] "자체 처리" 문자 구현 = 무허가 폐기물처리업 → D5 재정의로 회피.
- [중] 쿠폰 설계 이탈(기름값 충당/제3자 사용/충전금화) 시 전금법 선불수단 포섭(2024-09 개정으로 범위 확대).
  현 설계는 비해당 가능성 높음 + 발행잔액 30억/연 500억 미만 등록 면제. [중] 쿠폰 소진을 RPC 밖에서 처리하면
  동시 수락 오버스펜드 — F3a-② 원자 처리 필수. [중] PG orphan 결제(승인 후 confirm 유실) — 1-4 대사 절차가
  방어선. [중] 점주의 현금 수입이 기록에 남는 과세 매출이 되는 역설 — 온보딩 커뮤니케이션 설계 필요.
  [중] 시세 tick 희소 시 히어로 차트 빈약 — 운영 룰(영업일 1회) + 빈 상태 설계.
- [하] PG 심사 지연 시 F4 이후 태스크 병목 — F5~F13은 테스트 키로 개발 가능해 심사와 병행.

## 미결 결정 (구현 중 확정 필요 — 스펙에 없으면 여기 기록 후 질문)
1. **쿠폰 단가 초기값**(원/장) — 제휴 수거업체 콜비 시장가 조사 후 CEO 확정. (수량 프리셋 10/30/50장은
   F4-⑤에 잠정 확정 — 단가 확정 시 조정 가능)
2. D5(자체 처리→인계 재정의) 최종 승인 + 법률 질의 발주 시점.
3. 요청 단계 사진 첨부(기름 상태 가이드) — 스키마+Storage 변경 필요, 별도 태스크로 분리 여부.
4. 쿠폰 유효기간 설정 여부(전상법 약관과 연동 — 약관 검토 결과에 종속).

## 구현 규칙 (Opus 작업 시)
1. **F1부터 순서대로.** 각 태스크 독립 커밋(또는 PR), `pnpm lint && pnpm test && pnpm build` green 필수.
   F2/F3a/F11/F12는 pgTAP(`supabase/tests`)도 green.
2. **착수 전 선행 조건**: 워킹트리의 E1/E2/E4/E5를 독립 커밋으로 먼저 완료할 것(F8이 AppShell에 의존,
   rebase 충돌 방지).
3. 절대 규칙 확장판 준수: 쿠폰 원장 insert는 service_role RPC에만, 잔액은 v_coupon_balance로만,
   PG 시크릿은 Edge Function에만. 상태 전이는 fn_transition_order 단일 진입점 유지.
4. enum 값 삭제 금지(DELIVERED/EARN 등), 레거시 주문(PICKED_UP 잔존분·coupon_cost null)은 구 경로로 완결.
5. 공용 UI는 packages/ui(+DevUiPage 목업), 신규 상수/스키마는 packages/core. 앱별 중복 정의 금지.
6. 완료 시 이 문서 해당 태스크에 `[x]` + 04-tasks.md 방식(파일:라인 근거+실측 검증)의 한 줄 기록.
7. **프로덕션 배포 체크리스트(순서 엄수)**:
   ⓐ F2 마이그레이션(순수 추가) 적용
   ⓑ fn_charge_coupon/fn_consume_coupon + coupon-adjust/coupon-price-set 배포(F3a-①·F3b-⑤ 산출물)
   ⓒ coupon-adjust로 데모 라이더 2개에 20장 선지급 + 쿠폰 단가 최초 tick 등록
   ⓓ **REQUESTED·진행중(ACCEPTED/ARRIVED/DISPUTED/PICKED_UP) 잔존 주문 0건 확인** — 있으면 시스템 취소/구 경로로
     드레인(coupon_cost null 주문이 신 게이트와 섞이는 전환기 최소화)
   ⓔ fn_transition_order 교체 + order-accept/order-transition/order-create/price-set Edge Function을
     **같은 릴리즈로 동시 배포**(RPC만 먼저 바꾸면 INSUFFICIENT_COUPON이 구 mapTransitionError에서
     INVALID_TRANSITION/500으로 새는 간극 발생)
   ⓕ 앱 순차 배포: rider→user→admin. Vercel은 정적 원샷 배포라 재빌드+재배포 필요(DEPLOY.md).

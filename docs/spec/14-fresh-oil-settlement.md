# 14 — 신유(새 식용유) 구매 · 현장 상계 · 좌상 정산 (J-태스크)

2026-07-24 CEO 지시로 확정한 6차 고도화. 위에서부터 순서대로, 각 태스크는 DoD(build/lint/test +
pgTAP green + 벤더 재생성 확인) 만족해야 종료. **이 문서가 신유 구매·상계·좌상 정산·수거추적 완성의
단일 진실이다.** 13-org-dealer.md의 **D5("수수료·정산 로직 없음")를 이 문서가 대체**한다.

표기: 【U】user(점주) 【R】rider 【A】admin 【D】dealer(좌상) 【core】packages/core 【ui】packages/ui 【DB】supabase

## 0. ⚠️ 규제 프레이밍 (구현 게이트 아님 — advisory)

좌상 크레딧 = **보증금 담보 B2B 외상채권**(회사가 좌상에게 사용한도를 주고 사후 정산 청구). 지급인이
보유하는 잔액에 돈을 충전하는 구조가 **아니므로** 선불전자지급수단이 아니다. 점주의 포인트 SPEND(신유
결제)는 **소비**로 현금유출 채무를 오히려 줄인다. **라이더 선충전은 이 설계 어디에도 없다.** 신용공여
구조는 법률 자문 권고(advisory)이며 구현 게이트가 아니다.

## 1. 확정 결정 (CEO)

| # | 항목 | 결정 |
|---|---|---|
| C1 | 신유 결제수단 | **상계 + 현금/포인트** — 한 방문에서 수거 수령액과 신유 대금을 상계, 차액(net)만 현금 또는 포인트 |
| C2 | 신유 상품/가격 | **18L 1종 단일 SKU + 어드민 고시가**(price tick 패턴, 신청 시점 스냅샷). 카탈로그 테이블 없음 |
| C3 | 신유 물류 | **좌상 재고, 소속 라이더가 수거 방문 때 싣고 가 배달**. 판매대금은 좌상 귀속(회사는 수수료/정산) |
| C4 | 신청 UX | **둘 다** — 수거신청에 "새 기름 받기" 옵션 스텝 + 신유 단독 신청(`?mode=purchase`) |
| C5 | 좌상 크레딧 | 보증금 예치 → 회사가 레버리지 얹은 포인트 사용한도 지급(예 500만원→700만P). 라이더는 소속 좌상 한도에서 현장 POINT 지급(선충전 없음). 누적 사용 500만P 도달 시 회사→좌상 정산 청구 |
| C6 | 규제 | §0 — 선불충전 금지, 외상채권 구조, advisory |
| C7 | 수수료 | **요율 설정 가능, 초기 0%**(`dealer_accounts.fee_rate_bp`) — 요율 확정 없이도 구조 완성 |
| C8 | 폐유 종착지 | **좌상 창고** — 회사 집하장(depot) 개념을 좌상 창고로 대체·흡수. depots/DELIVER는 레거시 동결 |

## 2. 데이터 모델 (additive-only, `01-db-schema.sql` 동기화 필수)

### 2-1. 신유 고시가 `fresh_oil_price_ticks` (price_ticks 미러)
`{ id, price_per_can int >0(원/캔 18L), effective_at, created_by }`. RLS: select true / insert is_admin() /
update·delete 정책 없음(정정 불가·신규 tick만). Realtime publication 추가.

### 2-2. `pickup_orders` 확장
- `order_kind order_kind`(enum `PICKUP`|`PURCHASE`|`MIXED`, null=레거시=PICKUP; `coalesce`로 읽음)
- `purchase_requested_cans int 1..50`, `snapshot_fresh_can_price int`(둘 동반 CHECK)
- `delivered_cans int 0..50`, `purchase_amount int`, `net_amount int`(음수 가능)
- `arrived_at timestamptz`(ARRIVE 스탬프), `dealer_id uuid`(ACCEPT 스냅샷), `dealer_settlement_id uuid`(FK)
- 부분 인덱스 `(dealer_id) where status='COMPLETED' and dealer_settlement_id is null`
- **`cash_paid_amount` 의미 동결** = 폐유 총액 `round(final_kg × snapshot_price_per_kg)`. 상계 결과는 `net_amount`.
- **`payout_method` 재사용** = NET 잔액의 정산 수단(양방향). 수거-only면 의미 불변.

### 2-3. `pickup_items` (바코드 1급)
`{ id, order_id, rider_id, barcode, geo_lat, geo_lng, captured_at, created_at, unique(order_id,barcode) }` +
barcode 인덱스. RLS select = **`p_events_read` 정확 미러 = admin | 주문 supplier | 주문 rider**(dealer 제외 —
미러 대상 정책에 dealer가 없고, 바코드까지 좌상에 열 이유가 없다. 좌상 창고 입고 대사는 `dealer_intakes`
부활 시 별도 설계). 쓰기 정책 없음(service_role RPC만).
SUBMIT 시 **replace-set**(delete→insert; 원본 payload는 order_events에 영구 보존).

### 2-4. 좌상 정산 레이어
> 아래는 **구현 확정형**(20260724000006/8과 1:1). 스키마 단일 진실은 `01-db-schema.sql`.

- `dealer_accounts { dealer_id PK, deposit_amount int, credit_limit int, claim_threshold int default 5000000,
  fee_rate_bp int 0..10000 default 0, updated_at, updated_by }`. RLS select=본인+admin, 쓰기=service_role
  (`fn_set_dealer_account`). 레버리지 비율은 **하드코딩 안 함** — 계약별 수기(UI ×1.4 프리필).
  ⚠️ 계정 행이 **없으면 크레딧 게이트 미적용**(§10 #2 결정) — admin이 계정을 만들어야 상한이 활성화된다.
- `dealer_settlements { id, dealer_id **not null**, status(CLAIMED|SETTLED|VOID), point_minted, point_spent,
  fee_amount, net_due, period_start/end, claimed_at/by, settled_at/by, voided_at/by }`. 주문 귀속은
  `pickup_orders.dealer_settlement_id` **스탬핑**(날짜범위 아님) → "정산=윈도우 리셋" 원자적.
  건수는 컬럼으로 들지 않고 `v_dealer_settlement_orders`(청구 상세/CSV)에서 센다.
- **본사 직속**(`pickup_orders.dealer_id is null`)은 청구 대상이 아니다 — 회사가 자기에게 청구하지 않으므로
  `dealer_settlements` 행도, `v_dealer_statement` 행도 만들지 않는다(뷰는 `role='dealer'`만).

### 2-5. RLS 재정의 (⚠️ 보안 — 검증 반영)
기존 `p_orders_read_by_dealer`(rider_profiles.dealer_id **현재값** 라이브조인)는 라이더 재배정 시 **새 좌상에게
과거 주문 재무정보+점주 PII 누출** → 주문 읽기를 **스냅샷 기준**으로 교체:
`create policy p_orders_read_by_dealer_snapshot on pickup_orders for select using (dealer_id = (select auth.uid()))`
로 대체하고 라이브조인 주문 정책은 폐기. 운영 가시성 필요 시 재무 컬럼 제외 security_invoker 뷰로 별도.

### 2-6. enum
- `order_kind` 신규 enum(신규 type — ALTER TYPE 트랜잭션 제약 없음).
- `ledger_type` **신규 값 `TRADE_PURCHASE`**(점주 포인트 차감, 음수). ⚠️ 기존 `PURCHASE`는 "쇼핑몰 결제"
  라벨로 이미 예약(LedgerList/SettlementPage) → 재사용 금지. `ALTER TYPE ledger_type ADD VALUE`는 단독
  마이그레이션(dealer_role 선례). 라벨 "새기름 결제(차감)"을 LedgerList·SettlementPage·useWallet 현역 목록 등록.
- `dealer_settlement_status` 신규 enum. **order_status 신규 값·신규 액션 없음**(PICKED_UP/DELIVERED 레거시 동결).

## 3. 상태머신 · RPC (`fn_transition_order` 전체 재정의 1건, helper `fn_settle_trade` 추출)

경로·액션명 불변: 구매-only도 `REQUESTED→ACCEPTED→ARRIVED→(SUBMIT_MEASURE)→CONFIRM_MEASURE→COMPLETED`
(의미만 "계량 제출"→"현장 거래 제출"로 확장, orderMachine 주석 갱신).

- **ACCEPT**: `dealer_id = (select dealer_id from rider_profiles where id=actor)` 스냅샷.
- **ARRIVE**: `arrived_at=now()`.
- **SUBMIT_MEASURE** payload `{ measuredKg, photoUrls[≥1], payoutMethod, deliveredCans?, barcodes?[≤50], geo? }`:
  - `deliveredCans`는 `purchase_requested_cans not null`이면 **필수(0..50)** — 구번들 침묵0 방지(부재→VALIDATION_ERROR).
  - `measuredKg ≥0` 허용은 구매 동반 시만; **순수 수거는 >0**(RPC에서 강제 — zod kgSchema는 nonnegative라 못 막음).
  - pickup_items replace-set(barcodes+geo). 소프트 fail-fast 게이트(락 없이): 한도초과/잔액부족 예상 시 조기 에러.
- **CONFIRM_MEASURE / FORCE_COMPLETE** → `fn_settle_trade(order, actor, tag)`:
  ```
  v_waste    = round(final_kg × snapshot_price_per_kg)::int          -- cash_paid_amount(동결)
  v_purchase = coalesce(delivered_cans,0) × coalesce(snapshot_fresh_can_price,0)  -- 정수곱
  v_net      = v_waste − v_purchase                                  -- 전무거래(둘 다 0) 거부
  -- payout_method='POINT'일 때만 원장 발행(CASH=기록만):
  net>0 : 좌상 크레딧 게이트(advisory xact-lock dealer_credit:{D}, usage+net>limit→DEALER_LIMIT_EXCEEDED)
          → fn_post_ledger(supplier,'EARN',v_net,order_id,...)       -- 본사직속(dealer null)=무게이트
  net<0 : point_ledger user 행 FOR UPDATE(출금과 동일 락)+잔액검사, 부족→INSUFFICIENT_BALANCE 전체 롤백(ARRIVED 유지)
          → fn_post_ledger(supplier,'TRADE_PURCHASE',v_net /*음수*/,order_id,...)
  net=0 : 원장 무기록.  분할결제(부분 포인트+부분 현금) 불허 — 단일 수단, 부족분은 전액 현금 재제출.
  ```
  **하위호환**: 구매 없으면 v_net=v_waste → 기존 EARN·cash_paid_amount와 동일(pgTAP 회귀 고정).
- **RESOLVE_DISPUTE**: `finalKg` 필수 유지 + `finalCans?` 선택 추가. DISPUTE/CANCEL 불변(캔 반납은 오프라인).

## 4. 정산 체인 수식

- 주문별: `minted = net (POINT∧net>0)`, `spent = −net (POINT∧net<0)`, CASH=정산 무관(수수료 베이스엔 포함).
- **미정산 사용액** `usage(D) = Σminted − Σspent` (COMPLETED ∧ dealer_id=D ∧ dealer_settlement_id null).
  게이트: CONFIRM에서 `usage > credit_limit → DEALER_LIMIT_EXCEEDED`(advisory lock으로 동시 CONFIRM 직렬화).
  구현상 이 주문은 이미 COMPLETED로 기록된 뒤 집계하므로 **usage에 net이 포함**된다 — 즉 `usage+net>limit`와 동치.
  경계는 `>`(한도 정확히 소진은 허용). 계정 행이 없으면 게이트 미적용(§10 #2).
- **청구**(RPC 3종, service_role): `fn_create_dealer_claim`(락→대상주문 집계·`fee=round(Σcash_paid_amount×bp/10000)`
  →insert+스탬핑), `fn_settle_dealer_claim`(CLAIMED↔SETTLED 멱등 마킹, referral 선례), `fn_void_dealer_claim`
  (CLAIMED만·스탬프 해제→풀 복귀). 자동청구 없음 — `over_threshold` 배지로 admin 유도, 하드스톱은 CONFIRM 게이트.
  `net_due = minted − spent + fee` (음수=회사→좌상 지급 허용).
- **뷰**: 신규 `v_dealer_statement`(좌상별 usage/limit/headroom/over_threshold. `role='dealer'`만 — 본사 행 없음, §2-4),
  `v_dealer_settlement_orders`(청구 상세/CSV). 기존 `v_dealer_rider_stats`/`v_rider_payout_daily`는
  **끝에 컬럼 append**로 재정의(소비자는 명명 컬럼 select — 안전, 순서 보존).

## 5. UX 표면 (한국어)

- **【U】** RequestPage "새 기름 받기" 스텝(구매 스테퍼+고시가+상계 미리보기; tick 없으면 숨김) + `?mode=purchase`
  단독 + HomePage 진입 카드; OrderDetail 구매/상계 카드 + arrived_at 타임라인 + **라이더 실시간 마커**; Wallet
  `TRADE_PURCHASE` 라벨 "새기름 결제(차감)"; 훅 useFreshOilPrice/useRiderLocation.
- **【R】** 콜 카드/상세 "신유 n캔 지참" 배지(useOpenCalls select 컬럼 추가만); ArrivedPanel deliveredCans 스테퍼 +
  상계 미리보기 + 잔액 정산수단 선택 + INSUFFICIENT_BALANCE/DEALER_LIMIT_EXCEEDED → "현금으로 재제출" 토스트.
- **【A】** PricePage 신유 고시가 섹션(price-set에 `kind` 추가); DealersPage 계정 패널(보증금/한도/임계/요율 →
  dealer-account-set Edge); SettlementPage "좌상 정산" 탭(statement/청구 생성·정산·무효/CSV); OrdersPage kind 필터+구매 컬럼.
- **【D】** 신규 DealerStatementPage(/statement — 본인 usage/limit/미정산 라인/청구 이력); PerformancePage 컬럼 추가.

## 6. 수거 추적 완성

1. pickup_items 적재(RPC replace-set) → 바코드별 역추적.
2. **라이더 위치 소비자 신설** `useRiderLocation(orderId)` — broadcast 채널 `order:{id}:location` 구독(앱 최초 broadcast
   소비자) → MapView 라이더 마커(60초 무갱신 흐림) → OrderDetail(ACCEPTED/ARRIVED). ⚠️ 채널 **private 전환 +
   realtime.messages RLS**(당사자만 구독). 폴백 = rider_profiles.last_location.
3. arrived_at 스탬프 → 타임라인 '-' 해소.
4. **집하장 폐기**(C8) — 좌상 창고가 대체. depots/DELIVER 레거시 동결. 필요 시 `dealer_intakes`로 부활(1차 제외).

## 7. 마일스톤 (J0~J4)

- **J0** 브랜치 정리·슬림 리베이스(§4/§6/§8 + tokens 조화 + Payou* + BrandMark 제거·이관). **완료**(97b07e7).
- **J1** 트래킹: arrived_at + pickup_items + RPC 적재 + useRiderLocation/MapView. pgTAP `11_tracking_test.sql`. **완료**(35c45a9).
- **J2** 구매·상계 코어: fresh_oil_price_ticks + 주문 컬럼 + TRADE_PURCHASE + order-create/RPC(fn_settle_trade) + user·rider·admin UI.
  pgTAP `12_purchase_netting_test.sql`(net 3부호×CASH/POINT·부족롤백·레거시 회귀·게이트). **완료**(2d0988c).
- **J3** 좌상 정산: dealer_id ACCEPT 스냅샷(트리거) + accounts/settlements + 크레딧 게이트(advisory lock) + 청구 RPC 3종
  + Edge 2종(dealer-account-set·dealer-claim) + 뷰 2종 + admin/dealer 화면. RLS 라이브조인→스냅샷 재정의.
  pgTAP `13_dealer_settlement_test.sql`(재배정 귀속불변·게이트 경계·본사직속·청구집계fee·스탬핑·멱등·무효). **완료**(70e33c3).
- **J4** 마감: CSV(v_dealer_settlement_orders) + 문서 동기화(01/02/14) + 벤더 재확인 + 적대적 리뷰 + PR. **완료.**

> 게이트: 각 마일스톤 build/lint/test 전부 통과(코어389·admin112·rider104·ui109·user140). pgTAP는 로컬 Docker
> 부재로 미실행(작성 완료 — 호스티드/CI 스택에서 실행). Edge는 Deno이므로 pnpm 게이트 밖(벤더=core 일치 확인으로 대체).

## 8. 엣지케이스 (해결 확정)

구매-only 폐유0(구매 동반 시만 measuredKg 0 허용) / 업셀(>신청, 캡50) / 배달0(재고없음) / net=0 무기록 /
포인트부족 롤백→현금 재제출(출금과 동일 FOR UPDATE) / SUBMIT↔CONFIRM 한도초과(CONFIRM advisory lock) /
본사직속 무게이트 / 시세변동(이중 스냅샷) / 레거시 order_kind null=PICKUP(회귀 고정) / cash_paid_amount 동결(CSV
하위호환) / 벤더 재생성 체크 / requestedKg 1..500은 폐유 성분에만(구매-only 0, refine "둘 다 0" 차단, TOO_MANY_ACTIVE
동일) / 캔 적재 후 CANCEL(오프라인 반납) / 분쟁 finalCans 선택 / 좌상 재배정(스냅샷 불변) / 신유 tick 부재(404+스텝 숨김) /
구번들 제출(deliveredCans 부재→VALIDATION_ERROR).

## 9. 미확정 (CEO 확인 — 권고 기본값으로 진행)

①단일 SKU·수시 tick 개정 ②수수료 베이스=폐유 총액·rate 0 출시 ③레버리지 표준화 안 함(수기+×1.4) ④임계 기본
500만P 좌상별 조정 ⑤집하장 폐기 ⑥본사직속=본사 재고·무게이트 ⑦부분 분할결제 불허 ⑧재고 수량관리 1차 제외 ⑨법률자문 advisory.

## 10. 검증 (J4) — 적대적 리뷰 → 정적 감사 → **pgTAP 실행 GREEN**

3단계로 검증했고 **최종적으로 pgTAP 전체 스위트가 실제로 통과**했다(13개 파일 225 단언).

### 10-1. 적대적 코드 리뷰 (재무 로직) — 4건 판정

- **#1 (수정)** `fn_create_dealer_claim` 원자화: 집계 SELECT와 스탬프 UPDATE가 별개 문장이라, 그 사이에 동시 완료(net<0/net=0/CASH — 게이트 advisory lock 미경유)가 커밋되면 스탬프는 되나 집계에서 누락돼 총계가 어긋나고 주문이 유실됐다. `UPDATE … RETURNING` 데이터변경 CTE로 "집계 대상=스탬프 대상"을 보장. `20260724000008`.
- **#4 (수정)** `v_dealer_rider_stats.point_paid`가 cash_paid_amount(동결=폐유 총액)를 써 MIXED POINT에서 과다 계상 → net 기준으로 교정(레거시 net null은 폴백). `20260724000008`.
- **#2 (결정·문서화)** 좌상 계정 미설정 시 크레딧 게이트 무적용(=무제한). 이유: (a) 미정산 사용액은 청구(claim)로 **전액 추적·청구 가능** — 게이트는 예방적 상한일 뿐 회계 안전장치가 아니라 돈이 새지 않는다; (b) deny 기본값은 배포 즉시 모든 좌상의 POINT 완료를 막아 운영이 더 위험. admin이 계정을 생성하면 게이트가 활성화된다(요율 0% 출시와 동일한 "구조 완성·집행 설정" 원칙).
- **#3 (결정·문서화)** 좌상 주문 읽기 RLS를 스냅샷으로 재정의하면서 기존(dealer_id null) 주문은 좌상 통계에서 제외된다(누출은 없음 — 리뷰 확인). 현재 배정 기준 백필은 재배정된 라이더의 과거 주문을 새 좌상에 귀속시켜 **바로 그 PII 누출을 재도입**하므로 백필하지 않는다. 손실 수용(신 기능이라 과거 귀속 데이터 미미).

### 10-2. pgTAP 정적 감사 — 4건 (실행 전, 계약 오류)

- `plan(N)` 불일치 3건 — `11`(14→13) · `12`(24→22) · `13`(20→19). pgTAP은 계획치≠실행수를 **로직과 무관하게
  실패**로 처리하므로 세 파일 모두 첫 실행에서 즉시 실패했을 상태였다(단언 커버리지는 의도대로 온전, 헤더 숫자만 오기).
- `is()` 타입 불일치 1건 — `11`의 `geo_lat`(double precision) vs 리터럴 `37.5`(numeric). 다형 `is(anyelement,
  anyelement)`가 해석되지 않는다 → 양쪽 `::numeric` 명시 캐스팅(`10_dealer_test.sql` `collected_kg` 선례와 동일).

### 10-3. pgTAP 실제 실행 — **실행해야만 드러나는 결함 2건** (`20260724000009`)

"Docker가 없어 실행 불가"는 사실이 아니었다(PostgreSQL 16이 이미 설치돼 있었고 postgis·pgtap은 apt로 설치 가능).
Docker 없이 임시 클러스터 + Supabase shim으로 전 마이그레이션을 적용해 실행한 결과, 정적 감사로는 원리상 잡을 수
없는 결함 2건이 드러났다:

- **① `pickup_items` GRANT 누락(치명)** — `20260724000001`이 RLS 정책만 만들고 테이블 권한을 부여하지 않았다.
  RLS는 행을 거르는 층이고 그 **이전에** 테이블 권한이 필요하므로, 점주·라이더가 바코드 수거이력을 조회하면
  `permission denied for table pickup_items`로 **전면 차단**된다. 같은 시기 신설한 다른 테이블
  (`fresh_oil_price_ticks`·`dealer_accounts`·`dealer_settlements`)은 grant가 있었고 이 테이블만 빠졌다.
  → `11_tracking`의 RLS 매트릭스가 검출.
- **② `order_kind` NULL 3치 논리(레거시 게이트 무력화)** — `v_purchase_involved := order_kind in ('PURCHASE','MIXED')`는
  레거시(`order_kind` null)에서 **NULL**을 반환하고, 이어지는 `not v_purchase_involved`도 NULL이라 분기가 발화하지
  않는다 → "순수 수거는 measuredKg>0 필수" 게이트가 레거시 주문에서 조용히 사라져 0kg 제출이 통과했다(이후 CONFIRM에서
  전무거래로 거부돼 주문이 ARRIVED에 갇힌다). `coalesce(..., false)`로 고정. → `12_purchase_netting` 19번이 검출.

### 10-4. 최종 결과

```
✅ 마이그레이션 43건 전부 적용
✅ 01~10 기존 스위트 171 단언 — 회귀 없음
   (특히 02_state_machine·08_payout_method 통과 = 넷팅 재작성의 하위호환 실증,
    10_dealer 통과 = 좌상 RLS 스냅샷 재정의 정상)
✅ 11_tracking 13 · 12_purchase_netting 22 · 13_dealer_settlement 19 — 신규 전부 통과
🎉 13 파일 225 단언 GREEN
```

재현: `bash scripts/pgtap-local/run.sh` (Docker 불필요 폴백 하네스). 정식 경로는 여전히 `supabase test db`다.

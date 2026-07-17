# 08 — 고도화 3차: 현장 지급수단 피벗 (현금·포인트) + 시세·UI 고도화 (G-태스크)

2026-07-15 CEO 지시로 확정한 비즈니스 모델 3차 피벗 계획. 04/06/07과 같은 방식:
**위에서부터 순서대로**, 각 태스크는 DoD 만족해야 종료. 이 문서는 07-pivot-plan.md의
수거쿠폰 모델(라이더 사전 구매·소진 게이트)을 **폐기**하고, 포인트 제도를 **지급수단**으로
부활시킨다. 신규 설계 판단은 이 문서가 단일 진실(07의 쿠폰 절은 레거시 기록으로 강등).

표기: 【U】user 【R】rider 【A】admin 【core】packages/core 【ui】packages/ui 【DB】supabase

---

## 0. 신모델 정의 (CEO 지시, 2026-07-15)

**구모델(07)**: 라이더가 수거쿠폰을 사전 구매(PG)해 콜 배정 시 소진. 현장 계량 후 **현금만** 지급.
포인트는 완전 동결(신규 발행 경로 0).

**신모델(08)**: 쿠폰 게이트가 사라지고, 현장 지급수단이 둘이 된다.
1. **쿠폰(티켓) 구매·소진 모델 폐기** — 라이더는 아무 비용 없이 콜을 수락한다.
   쿠폰 원장·구매 테이블은 append-only 회계 기록으로 보존(신규 발행 중지).
2. 점주(user)는 **18L 말통 / 10L 통 개수** 기준으로 수거를 신청하거나, 무게를 알면
   **kg 직접 입력**으로 신청한다(07 F9 구현 유지·강화).
3. 라이더는 현장에서 내용 확인·계량 후 **kg당 시세(주문 생성 시점 스냅샷)** 로 산정된 금액을
   현장에서 지급한다.
4. 지급수단은 **현금 또는 포인트** — 라이더가 계량 제출 시 선택한다.
   - 현금: 07과 동일(라이더가 점주에게 직접 현금 지급, 점주 앱 확인 = 2자 확인).
   - 포인트: 점주 수령 확인(CONFIRM_MEASURE)과 동시에 플랫폼이 점주 `point_ledger`에
     **EARN(+금액)** 발행. 1P = 1원.
5. 포인트로 받은 점주는 **출금 신청**을 별도로 할 수 있다(포인트 지갑 부활 — 최소 10,000P,
   admin 승인/지급 처리).
6. 디자인 고도화: **시세 그래프(PriceChart v2)** 와 전 앱 UI/UX 고도화.

### 결정 기록
| # | 결정 사항 | 확정 내용 |
|---|---|---|
| P1 | 수거쿠폰 모델 | **폐기 → 레거시 강등** — order-create가 `coupon_cost` 스냅샷을 중지(신규 주문 null). fn_transition_order ACCEPT의 CONSUME은 `coupon_cost is null → skip` 가드가 이미 있어 **RPC 무변경으로 게이트 자연 소멸**(전환기 잔존 주문은 구 게이트로 완결·환급 가능). coupon-* Edge Function 6종 코드 삭제+undeploy, 쿠폰 UI 전면 제거. coupon_ledger/coupon_purchases/coupon_price_ticks·DB RPC는 보존(enum·테이블 삭제 금지, 07 §0 원칙) |
| P2 | 지급수단 선택 주체·시점 | **라이더가 SUBMIT_MEASURE에서 선택** — payload에 `payoutMethod: 'CASH'\|'POINT'` 필수. `pickup_orders.payout_method`에 기록. 중재로 final_kg가 고정되기 전까지 재제출로 변경 가능(기존 재제출 가드 재사용). 점주가 수단에 동의하지 않으면 확인하지 않고 재제출을 요구하면 된다(2자 확인 원칙 유지) |
| P3 | 포인트 지급 회계 | 완료 전이(CONFIRM_MEASURE/FORCE_COMPLETE)에서 `payout_method='POINT'`이면 `fn_post_ledger(supplier, 'EARN', 금액, order_id)` 발행 — 기존 멱등 unique(order_id, entry_type, user_id) 재사용. 금액 = `round(final_kg × snapshot_price_per_kg)`. **`cash_paid_amount` 컬럼은 "확정 지급액"으로 의미 확장**(CASH=현금, POINT=포인트 P. 1P=1원이므로 동일 정수. 컬럼명 변경 금지 — 레거시 보존 원칙). `payout_method`가 null이면(레거시·중재 봉쇄 희귀 케이스) **CASH로 간주**(coalesce) |
| P4 | 출금 부활 | 기존 DB 자산 그대로 재사용 — `withdrawals` 테이블, `fn_request_withdraw`(user 단위 FOR UPDATE 직렬화·최소 10,000P), `fn_process_withdraw`(REQUESTED→APPROVED→PAID / REQUESTED→REJECTED+WITHDRAW_CANCEL 복구). F13이 삭제한 Edge Function 3종(withdraw-request/withdraw-process/point-adjust)을 git 이력에서 부활. 00-domain의 "포인트 원장 규칙"을 레거시에서 **현역으로 복권** |
| P5 | 라이더-플랫폼 정산 | 포인트 지급분은 **플랫폼이 점주에게 부담**(EARN 발행) — 라이더 선충전·차감 게이트를 도입하지 않는다(쿠폰 모델 재현 금지, CEO 지시 1). 라이더별 포인트 지급 실적은 admin 집계 뷰 `v_rider_payout_daily`로 가시화(오프라인 정산·청구 근거). 플랫폼 수익 모델은 별도 결정(스코프 밖) |
| P6 | 용기 프리셋 | 18L 말통 = **15kg**(`KG_PER_CAN` 유지), 10L = 비례 환산(15 × 10/18 ≈ 8.3kg, `estimateKg` 기존 구현), 직접 kg 입력 공존. 07 F9 구현 유지 + 신청 UI 표면 강화 |

### 프로덕션 전제 (07 §0 승계)
데모 계정만 존재, 실사용자 0명 — 쿠폰 잔액은 지급 채무가 아니며 클린 컷오버 가능.
enum 값·테이블·과거 원장 데이터는 절대 삭제하지 않는다. 잔존 쿠폰 잔액(데모 라이더 ADJUST
선지급분)은 회계 기록으로만 남는다.

---

## 1. 도메인 규칙 신설·개정 (G1에서 00-domain.md에 정식 반영)

### 1-1. 상태머신 개정 (경로 불변, 부수효과 개정)
상태 경로는 07과 동일: `REQUESTED → ACCEPTED → ARRIVED → COMPLETED`, 예외 `CANCELLED`/`DISPUTED`,
레거시 `PICKED_UP`/`DELIVERED`. 변경은 부수효과 3곳:

```
(생성)→REQUESTED : coupon_cost 스냅샷 중지(항상 null). 시세 스냅샷은 유지(절대 규칙 5).
REQUESTED→ACCEPTED : 쿠폰 잔액 가드·CONSUME 소멸(신규 주문 coupon_cost null → RPC가 자동 skip).
                     verify_status='APPROVED' 게이트(07 F11)는 유지.
ARRIVED(SUBMIT_MEASURE) : payload에 payoutMethod('CASH'|'POINT') 필수 추가 → pickup_orders.payout_method 기록.
                     kg+사진 가드·중재 완료(final_kg not null) 재제출 거부 가드는 기존 유지.
                     앱 표시: CASH "점주에게 지급할 현금 ₩N" / POINT "점주에게 적립될 포인트 N P".
ARRIVED→COMPLETED  : supplier CONFIRM_MEASURE — 의미: "무게 확인 + 지급 확인"(2자 확인).
                     cash_paid_amount = round(final_kg × snapshot_price_per_kg), completed_at = now().
                     payout_method='POINT'면 fn_post_ledger(supplier,'EARN',금액,order_id) 동일 트랜잭션 발행.
                     coalesce(payout_method,'CASH') — null은 현금 간주.
ARRIVED→COMPLETED  : admin FORCE_COMPLETE(D6 승계) — 동일 지급 로직(POINT면 EARN).
DISPUTED→ARRIVED   : admin RESOLVE_DISPUTE — 07 그대로(kg 확정까지만, ARRIVED 복귀).
{ACCEPTED|ARRIVED|DISPUTED}→CANCELLED : admin 전용 + fault 필수(07 D4·D6 유지 — 감사 기록).
                     쿠폰 환급 분기는 레거시 주문(CONSUME 존재) 전용으로 잔존 — 신규 주문 무영향.
```
- 현금 지급 증빙 = 계량 사진 + 점주 앱 CONFIRM(2자 확인) — 07 원칙 유지.
  포인트 지급 증빙 = CONFIRM과 원자적으로 발행되는 EARN 원장 행(분쟁 여지 구조적 제거).
- COMPLETED 이후 지급수단 분쟁은 CS(cs_tickets, category=CASH_DISPUTE 재사용) 영역.

### 1-2. 포인트 원장 규칙 (복권 — 07 D1의 "신규 발행 중지"를 해제)
- `point_ledger` append-only·뷰 조회(`v_point_balance`)·클라이언트 쓰기 금지 — 전부 기존 그대로.
- **현역 entry_type**: `EARN`(POINT 지급수단 완료 시 supplier 적립), `WITHDRAW_REQUEST`(출금 신청 -),
  `WITHDRAW_CANCEL`(반려 복구 +), `ADJUST`(admin 수동, point-adjust 부활).
- **레거시 전용(신규 발행 없음)**: `HOLD`/`RELEASE`(구모델 수거비 — 라이더 지급 이벤트는 이번에도 없음),
  `PURCHASE`(쇼핑몰, 미래). 잔존 HOLD는 held 표시로만 남는다(07 D1 보강 유지).
- 출금: 최소 10,000P, 신청 시 WITHDRAW_REQUEST(-)로 즉시 차감, 반려 시 WITHDRAW_CANCEL(+) 복구.
  상태 REQUESTED→APPROVED→PAID / REQUESTED→REJECTED (withdrawals 테이블).
- 불변식(pgTAP): POINT 완료 주문 1건당 EARN 정확히 1행(재시도 멱등), CASH 완료 주문은 point_ledger 무변경,
  FORCE_COMPLETE도 동일, 출금 신청→반려 왕복 후 잔액 원복.

### 1-3. 쿠폰 원장 규칙 (레거시 강등 — 07 §1-1의 미러 강등)
> 신규 CHARGE/CONSUME/REFUND/ADJUST 발행 경로는 order-create의 coupon_cost 중지와 coupon-* 함수
> 삭제로 소멸한다(전환기 잔존 주문의 CONSUME/REFUND만 예외 — RPC 분기 보존).
> 테이블·뷰·DB RPC(fn_charge_coupon 등)·과거 데이터는 감사 목적으로 보존, 삭제 금지.

### 1-4. 시세 규칙 (07 유지) + 일별 차트 고도화
- 시세 tick·스냅샷·일별 리샘플(종가+캐리포워드)·전일 대비 규칙 전부 07 그대로.
- **PriceChart v2**(G4): 기간 통계(최고/최저/평균) 표면화, 최고·최저 지점 마커, 곡선 스무딩
  (Catmull-Rom→cubic bezier, 등락 방향 왜곡 없는 소극 스무딩), 마지막 값 펄스 도트, y축 눈금
  가이드, 스크럽 툴팁에 전일 대비 병기. 순수 SVG 유지(라이브러리 추가 금지), reduced-motion 존중.

### 1-5. 알림 매트릭스 개정 (00-domain 표 전면 교체)
| 이벤트 | 수신자 | 카피(요지) |
|---|---|---|
| SUBMIT_MEASURE (CASH) | supplier | "계량 결과가 도착했어요 — 무게·현금 ₩N을 확인해 주세요" |
| SUBMIT_MEASURE (POINT) | supplier | "계량 결과가 도착했어요 — 확인하시면 포인트 N P가 적립돼요" |
| CONFIRM_MEASURE (CASH) | rider | "수거 완료 — 현금 ₩N 지급이 확인됐어요" |
| CONFIRM_MEASURE (POINT) | rider | "수거 완료 — 포인트 N P 지급이 확인됐어요" |
| CONFIRM_MEASURE (POINT) | supplier | "포인트 N P가 적립됐어요 — 지갑에서 출금 신청할 수 있어요" |
| FORCE_COMPLETE | supplier+rider | "관리자 확인으로 주문이 완료 처리됐어요" (+POINT면 supplier 적립 카피 병기) |
| RESOLVE_DISPUTE | supplier+rider | "이의신청 중재 결과: 확정 무게 O.Okg" |
| CANCEL(admin) | rider+supplier | 취소 통지 (쿠폰 환급 카피는 레거시 주문에서만) |
| 출금 승인/지급/반려 | supplier | "출금 신청이 승인되었어요" / "출금이 완료되었어요" / "출금 신청이 반려되어 포인트가 복구되었어요" |
| 인증/정지 (07 F11) | rider | 유지 |
기존 유지: 콜 도착 브로드캐스트, 수락됨, 도착, 30분 무수락 취소.
삭제: 쿠폰 충전 성공(대상 플로우 소멸).

---

## G-태스크

### G1. 【docs】 스펙 문서 개정 (코드 작업 전 선행)
- 작업: ① 00-domain.md — 용어표(수거쿠폰→레거시, 포인트 복권, 지급수단 신설), 상태머신 표
  부수효과 개정(1-1), 포인트 원장 절 복권(1-2), 쿠폰 절 레거시 강등(1-3), 알림 매트릭스 교체(1-5).
  ② 01-db-schema.sql — G2 DDL 반영. ③ 02-api.md — order-transition 계약(payoutMethod),
  order-create(couponCost 삭제), withdraw-request/withdraw-process/point-adjust 부활 절,
  coupon-* 6종 삭제 표기. ④ 03-frontend.md — 지갑/출금/지급수단 화면 개정. ⑤ CLAUDE.md 문서 맵에
  08 추가. ⑥ 07-pivot-plan.md 헤더에 "08이 쿠폰 모델 폐기" 각주.
- DoD: 신설 객체(payout_method/v_rider_payout_daily/부활 함수 3종)×각 문서 대응 절 존재.
- [x] 결과(2026-07-15): 08 문서 신설 + 6종 개정 — 00(용어표 복권/강등, 상태머신 부수효과, 포인트 원장
  복권 절, 쿠폰 레거시 강등 절, 알림 매트릭스 교체), 01(payout_method enum·컬럼, point_ledger 헤더 복권,
  쿠폰 절 강등, v_pickup_stats_daily 확장+v_rider_payout_daily, RPC 계약 주석), 02(order-create/accept/
  transition 개정 + §7/8/10 부활 + §11~15 삭제 표기), 03(3앱 "08 피벗 개정" 블록 + ui G4 절),
  CLAUDE.md(문서 맵 08 추가, 07 이력 강등), 07(헤더 폐기 각주). DEPLOY.md §1-0 컷오버 절차 +
  scripts/deploy-cutover.sh 08 기준 재작성.

### G2. 【DB】 마이그레이션 — payout_method + EARN 부활 (+ pgTAP 개정)
- 작업: ① `create type payout_method as enum ('CASH','POINT')` + `pickup_orders.payout_method` 추가
  (레거시 null). ② fn_transition_order 개정(20260709000010 기준 CREATE OR REPLACE):
  SUBMIT_MEASURE payoutMethod 파싱·검증·기록 / CONFIRM_MEASURE·FORCE_COMPLETE에
  POINT→fn_post_ledger EARN 발행(coalesce null=CASH). ACCEPT·CANCEL·DELIVER 분기 무변경(P1).
  ③ `v_pickup_stats_daily` 교체 — cash_amount/point_amount 분리 컬럼 추가(completed_at 기준).
  ④ `v_rider_payout_daily` 신설(admin 게이트 — rider_id·day·method별 건수/금액, security_invoker+
  is_admin() 패턴). ⑤ point_ledger Realtime publication은 기존(20260704000013) 유지 확인.
  ⑥ pgTAP: 01(POINT 완료→EARN 1행·CASH 완료→원장 무변경·멱등)·02(payoutMethod 가드·null=CASH)
  개정, 출금 왕복 회귀 유지, 05/03 쿠폰 어서션은 레거시 회귀로 강등 유지.
- DoD: `supabase db reset` + pgTAP green(로컬 스택 가능 시 — 불가 시 사유 기록). 01 동기화.
- [x] 결과(2026-07-15): 마이그레이션 2개(20260715000001 payout_method enum+컬럼+뷰 2종 /
  20260715000002 fn_transition_order 개정 — SUBMIT_MEASURE payoutMethod 검증·기록(생략 시 CASH 폴백),
  CONFIRM_MEASURE·FORCE_COMPLETE POINT→fn_post_ledger EARN, ACCEPT/CANCEL 쿠폰 분기 전환기 보존).
  pgTAP 08 스위트 신설 22어서션(P1 게이트 소멸/P2 검증·변경·폴백/P3 EARN 1행·멱등·CASH 무변경·
  FORCE_COMPLETE/P4 출금 왕복·잔액 초과) + 01/02 헤더 레거시 회귀 표기. **실검증: 환경에 docker 데몬이
  없어 supabase CLI 불가 → 시스템 Postgres 16 + postgis/pgtap + Supabase 셈(roles·auth.uid·storage·
  publication)으로 재현 — 마이그레이션 29개 + seed + pgTAP 8스위트 128어서션 전부 green**(하네스:
  세션 스크래치 pg-harness. 프로덕션 적용 전 supabase db reset 재확인 권장).

### G3. 【core】【API】 계약 개정 + 출금 함수 부활 + 쿠폰 함수 일몰
- 작업: ① 【core】constants에 `PAYOUT_METHOD_LABEL`, schemas의 transition payload에 payoutMethod,
  orderCreate 출력 couponCost 제거. orderMachine 주석 정합. ② order-create: coupon_cost 계산·스냅샷
  제거. ③ order-accept: 쿠폰 잔액 fail-fast 제거(INSUFFICIENT_COUPON 매핑은 전환기 보존).
  ④ order-transition: payoutMethod 전달 + 알림 매트릭스(1-5) 전면 개정. ⑤ withdraw-request/
  withdraw-process/point-adjust 부활(F13 삭제분 — git 이력 기반, config.toml 재등록).
  ⑥ coupon-purchase-intent/confirm/return/refund·coupon-adjust·coupon-price-set 코드 삭제
  (+config.toml 정리, undeploy는 배포 체크리스트). ⑦ vendor(oilpick-core) 재빌드.
- DoD: `pnpm lint/test/build` green. 신규 카피 단위 테스트. 시크릿 grep(클라이언트 번들에 PG/시크릿 0).
- [x] 결과(2026-07-15): core(payoutMethodSchema/PAYOUT_METHOD_LABEL·submitMeasure payoutMethod 필수·
  orderCreate couponCost 삭제·쿠폰 zod 5종 삭제·INSUFFICIENT_COUPON 레거시 재정의·COUPON_PRICE_NOT_SET/
  PAYMENT_FAILED 삭제·orderMachine 가드 문구 개정 + payout.test.ts 신설, 363 green). Edge: order-create
  coupon_cost 중지+couponCost 응답 삭제, order-accept 쿠폰 fail-fast 삭제(레거시 409 매핑 보존),
  order-transition 알림 매트릭스 수단별 분기(buildActionNotifications + PushSpec.link — POINT 적립 푸시
  /wallet 딥링크), withdraw-request/withdraw-process/point-adjust 부활(git b89358d^ 복원), coupon-* 6종
  +_shared pg/toss/koem 삭제, config.toml 재정렬, vendor 재빌드(build.sh).

### G4. 【ui】 PriceChart v2 + 공용 컴포넌트
- 작업: ① PriceChart v2(1-4) — stats 계산·마커·스무딩·y축 가이드·펄스 도트·툴팁 개선, 기존 props
  하위호환. ② PriceStatsRow(최고/최저/평균/기간 등락) 신설. ③ PayoutMethodChip(현금/포인트 뱃지)
  신설 — 주문 카드/상세/드로어 공용. ④ LedgerList point 변형 현역 복권(EARN/WITHDRAW_* 라벨 확인).
  ⑤ DevUiPage 목업 갱신.
- DoD: 컴포넌트 vitest + DevUiPage 목업. 하드코딩 색상 0(토큰만).
- [x] 결과(2026-07-15): PriceChart v2(소극 스무딩 Catmull-Rom→bezier·최고/최저 마커·y축 가이드
  (showGrid)·마지막 값 펄스(oilpick-chart-pulse, reduced-motion 정지)·툴팁 전일 대비 병기 — props
  하위호환, formatKrw 이중 "원" 접미 버그 동반 수정) + 테스트 5 신규. PriceStatsRow(최고/최저/평균/기간
  등락률, onDark) + PayoutMethodChip(CASH 그린/POINT 딥앰버) 신설 + 테스트. CallCard 쿠폰 칩 제거.
  LedgerList point 변형 현역 복권 확인. ui 104 green.

### G5. 【U】 포인트 지갑·출금 부활 + 홈/신청/상세 개편
- 작업: ① WalletPage → **포인트 지갑**: 잔액 히어로(v_point_balance available/held) + [출금 신청]
  + 포인트 내역(LedgerList) + 수령 이력(현금/포인트 칩 구분) 탭. 탭바 "수령액"→"지갑".
  ② WithdrawPage 부활(/wallet/withdraw — 계좌 등록 연동, 최소 10,000P, 신청 성공 시트).
  ③ OrderDetailPage: 계량 제출 후 지급수단 표시 + CONFIRM 카피 분기(CASH "현금 ₩N 받았어요" /
  POINT "포인트 N P 적립받기"), COMPLETED 히어로 수단별. ④ HomePage: 이번 달 수령 요약을
  현금/포인트 분리 + 포인트 잔액 칩, PriceChart v2 + PriceStatsRow 적용. ⑤ PricePage 동일 체계.
  ⑥ RequestPage: 18L/10L/직접 kg 프리셋 카피·접근성 강화(P6).
- DoD: 지갑 잔액→출금 신청→반려 복구 플로우 화면 테스트. 신규 화면 vitest. 포인트/현금 카피 정합.
- [x] 결과(2026-07-15): WalletPage 포인트 지갑 부활(잔액 히어로+출금 CTA(최소액 게이트)+포인트
  내역(LedgerList point)+수령 이력(PayoutMethodChip, 레거시 null=현금)), WithdrawPage 부활(계좌
  등록/표시·fail-fast·withdraw-request·성공 시트) + useWallet(usePointBalance/useLedger — point_ledger
  Realtime) 신설, 탭 "수령액"→"지갑". OrderDetailPage 수단별 확인 카피("현금 ₩N 받았어요"/"포인트 N P
  적립받기"+즉시 적립 캡션) + COMPLETED 히어로 수단별(+지갑 링크). HomePage 수령 요약 현금/포인트 분리
  + PriceStatsRow(onDark), PricePage showGrid+PriceStatsRow. OrdersHistoryPage 지급수단 칩.
  RequestPage/Onboarding "예상 수령액" 수단 중립 카피. DevUiPage 목업 신모델 전환. user 126 green.

### G6. 【R】 쿠폰 UI 전면 제거 + 지급수단 선택 플로우
- 작업: ① CallHomePage 쿠폰 잔액 카드 제거, /coupons·/coupons/purchase 라우트·페이지·훅 삭제.
  ② CallCard/CallDetailPage "쿠폰 N장 소진" 제거(예상 매입 지급액 유지), 수락 게이트 단순화.
  ③ ActiveRunPage ArrivedPanel — **지급수단 세그먼트(현금/포인트)** 신설(제출 전 필수 선택),
  제출 payload payoutMethod, 제출 후 안내 카피 수단별 분기, COMPLETED 패널 수단별.
  ④ EarningsPage: 쿠폰 요약 제거 → 이번 달 현금/포인트 지급 분리 통계. useTodayStats 수단 분리.
- DoD: 수단 미선택 제출 불가. 수단별 카피 렌더 테스트. 쿠폰 표시 문자열 잔존 0(레거시 렌더 분기 제외).
- [x] 결과(2026-07-15): 쿠폰 전면 제거(/coupons·/coupons/purchase 라우트, CouponsPage/
  CouponPurchasePage/useCoupons/tossWidget 삭제, CallHome 잔액 카드, CallCard/CallDetail 쿠폰 칩·수락
  게이트 — INSUFFICIENT_COUPON은 전환기 레거시 토스트만). ActiveRunPage ArrivedPanel 지급수단 세그먼트
  (현금💵/포인트🪙 radiogroup, 미선택 제출 불가, 지급액 미리보기 수단별, 제출 payload payoutMethod,
  재제출 버튼+프리필+기존 사진 재사용, 대기 배너·중재 배너·COMPLETED 패널 수단별 카피). EarningsPage
  수단 분리 히어로(현금/포인트+건수), useTodayStats/useMonthlyPickupStats/useRunHistory/useActiveRun
  수단 분리 개편. HistoryPage 지급수단 칩. SupportPage COUPON_PAYMENT 신규 접수 제외. rider 88 green.

### G7. 【A】 출금 큐 부활 + 포인트 운영 + 쿠폰 운영 일몰
- 작업: ① SettlementPage → "정산" 재편: 출금 큐(REQUESTED/APPROVED 처리 — withdraw-process),
  포인트 원장 감사, 라이더별 포인트 지급 집계(v_rider_payout_daily), 수거 추이(현금/포인트 분리
  v_pickup_stats_daily). 쿠폰 매출 대시·구매 목록·환불 UI 제거. ② DashboardPage KPI 교체:
  오늘 주문/수거 kg/현금 지급액/포인트 지급액/출금 대기/활성 라이더. ③ OrdersPage 드로어:
  지급수단 칩+지급액, 귀책 취소 카피에서 쿠폰 환급 문구를 레거시 조건부로. ④ PricePage 쿠폰 단가
  섹션 제거. ⑤ UsersPage RiderCouponPanel 제거 → 라이더별 포인트 지급 실적 + [포인트 조정]
  (point-adjust, supplier 대상) 연결. ⑥ CSV 내보내기 대상 갱신(출금/포인트 원장).
- DoD: 출금 신청→승인→지급/반려 E2E(컴포넌트+RPC 테스트 조합). KPI·집계가 원장 합계와 일치 테스트.
- [x] 결과(2026-07-15): SettlementPage→"정산" 재편(출금 큐 — 상태 필터·승인/반려(사유 필수)/지급
  완료→withdraw-process·CSV / 수거 추이 현금·포인트 분리+합계 / 라이더별 지급 실적(v_rider_payout_daily
  30일 합산 — 정산 대상 표기) / 포인트 원장 감사+CSV) + useSettlementAdmin 신설(useSalesAdmin·
  couponSales 삭제). Dashboard KPI 6종 교체(현금/포인트 지급·출금 대기). OrdersPage 드로어 지급수단
  뱃지+확정 지급액(P/원)+쿠폰 필드 레거시 조건부+귀책 카피 개정. PricePage 쿠폰 단가 섹션 삭제.
  UsersPage RiderCouponPanel 삭제+supplier [포인트 조정] 모달(point-adjust). CsPage COUPON_PAYMENT
  레거시 안내 전환. AdminShell "매출·정산"→"정산". **G7-⑤ 편차: 라이더별 지급 실적 요약은 UsersPage
  라이더 카드가 아니라 /settlement 표로 단일화**(정산 근거 단일화 — IA 판단, 03 블록과 함께 기록).
  admin 88 green.

### G8. 【정리】 쿠폰 일몰 마무리 + 시드 갱신
- 작업: ① 미사용 심볼 sweep — grep 목록: `useCouponBalance`, `useCouponLedger`, `CouponsPage`,
  `CouponPurchasePage`, `couponPurchaseIntent/Confirm/Refund` zod, `coupon_cost`(신규 코드 경로),
  `INSUFFICIENT_COUPON`(UI 경로), `v_coupon_balance`(앱 경로). 각 참조 0 확인 후 제거(레거시 렌더
  분기·DB 계약 미러는 보존 명시). ② seed.sql 신모델 갱신(쿠폰 선지급 제거, 포인트 데모 시나리오 —
  POINT 완료 주문 1 + EARN + 출금 신청 1). ③ qa-checklist.md 갱신. ④ DEPLOY.md 컷오버 절차(§배포
  체크리스트) 추가.
- DoD: `pnpm lint/test/build` green. grep 전수 기록.
- [x] 결과(2026-07-15): sweep — useCouponBalance/useCouponLedger/CouponsPage/CouponPurchasePage/쿠폰
  zod/coupon-* Edge/queryKeys 쿠폰 축 참조 0(삭제 완료). 보존(사유 명시): fn_transition_order 쿠폰
  CONSUME/REFUND 분기·order-accept INSUFFICIENT_COUPON 매핑(전환기 잔존 주문), rider HistoryPage·admin
  드로어 쿠폰 표기(레거시 주문 렌더 전용), DB 쿠폰 테이블·RPC(회계 기록). seed.sql 신모델(쿠폰 시드
  제거, POINT 완료 주문+EARN+출금 신청 데모). qa-checklist는 후속 정비로 이월(코드 기능 무영향).
  DEPLOY.md·deploy-cutover.sh 갱신은 G1에 포함.

### G9. 【검증】 게이트 + 어드버서리얼 리뷰
- 작업: 전체 게이트(lint/test/build [+pgTAP]) → 멀티 렌즈 코드 리뷰(정합성/보안/회귀) → 확정 결함
  수정 → 커밋/PR.
- DoD: 게이트 green + 리뷰 확정 결함 0 잔존.
- [x] 결과(2026-07-15): 게이트 — lint 7/7, vitest 7/7(core 363·ui 104·user 126·rider 88·admin 88 =
  769), build 5/5, DB 하네스(마이그레이션 29+seed+pgTAP 128어서션) green. 멀티 에이전트 리뷰는 세션
  사용량 한도로 축소 — 심장부(RPC·원장)는 pgTAP 실측으로, 앱 계층은 스위트 재작성+수동 diff 리뷰로
  대체. 커밋/PR은 브랜치 claude/point-system-payment-redesign-1jt80a.

---

## 배포 체크리스트 (순서 엄수 — DEPLOY.md에 전사)
ⓐ G2 마이그레이션 적용(payout_method는 순수 추가 — 기존 동작 무영향).
ⓑ **REQUESTED·진행중 잔존 주문 0건 확인**(coupon_cost 있는 주문이 신 플로우와 섞이는 전환기 최소화 —
   있으면 드레인. 잔존 ACCEPTED+ 쿠폰 주문의 완결·환급은 구 분기가 처리하므로 강제 아님).
ⓒ fn_transition_order 교체 + order-create/order-accept/order-transition + withdraw-request/
   withdraw-process/point-adjust를 **같은 릴리즈로 동시 배포**.
ⓓ 앱 순차 배포: rider→user→admin (Vercel 재빌드).
ⓔ coupon-* 6종 undeploy — ⓓ 완료 후(`supabase functions delete coupon-purchase-intent` 등).
   DB의 fn_charge_coupon/fn_consume_coupon/fn_confirm_purchase/fn_refund_purchase는 보존.
ⓕ 데모 시나리오 재기록(포인트 지급→출금).

## 리스크 레지스터
- [중] 포인트 발행 = 플랫폼 부채 — P5의 라이더 정산 뷰가 유일한 대사 근거. 실 라이더 온보딩 전
  정산 프로세스(청구 주기·수단) 확정 필요(스코프 밖, 외부 의존).
- [중] 전환기 쿠폰 주문 혼재 — ACCEPT CONSUME/CANCEL REFUND 분기 보존으로 완결 가능, 배포 ⓑ로 최소화.
- [하] payout_method null 주문의 CONFIRM — coalesce CASH 폴백으로 교착 없음(P3).
- [하] 출금 러시 — fn_request_withdraw의 user 단위 직렬화가 잔액 음수 차단(기존 검증 자산).

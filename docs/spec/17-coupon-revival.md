# 17. 수거쿠폰 복권 — 라이더 쿠폰 구매·수락 게이트·좌상 실적 (8차 고도화, Q-태스크)

> **결정(CEO, 2026-08-05)**: 08 P1이 폐기했던 수거쿠폰 모델을 **복권**한다. 08 P1의
> "쿠폰 모델 재현 금지(CEO 지시 1)"는 본 지시로 **명시적으로 역전**된다. 이 문서가
> 쿠폰 구매·소진·환급·좌상 실적의 단일 진실이며, 07-pivot-plan(원 설계)과 F14(코엠
> 결제)의 자산을 그대로 재사용한다. **08의 지급수단(현금/포인트) 모델은 불변** —
> 쿠폰은 "라이더가 콜을 받을 권리"이고, 폐유 대금 지급(08)과는 독립된 축이다.
> 이로써 08 P5가 미결로 남겼던 **플랫폼 수익 모델이 쿠폰 판매로 확정**된다.

## 0. CEO 지시 원문 요약

1. 쿠폰 1개당 가격은 **관리자가 지정**한다.
2. 라이더는 **기름 1통당 쿠폰 1개**를 사용한다 — 예: 3통 수거 신청이면 쿠폰 3개가
   있어야 콜 수락 가능.
3. 결제는 **코엠페이먼츠**로 구성하고 **간편결제**까지 지원한다.
4. 사용한 쿠폰 비용은 **좌상이 플랫폼 실적으로 확인**할 수 있으면 된다(정산 아님 —
   조회 전용).

## 1. 결정 사항

| # | 결정 | 확정 내용 |
|---|---|---|
| C1 | 모델 | 07 D2 원형 복권 — `coupon_cost = ceil(requested_kg / KG_PER_CAN)`(15kg=1통 기준, kg 직접 입력도 자동 환산). order-create가 스냅샷을 **재개**하면 fn_transition_order의 잠들어 있던 ACCEPT CONSUME 게이트가 **RPC 무변경으로 자연 부활**(08 P1의 역연산). 잔액 부족 = `INSUFFICIENT_COUPON` 409 → 수락 불가 + [충전하러 가기] CTA |
| C2 | 단가 | 관리자 지정 — `coupon_price_ticks`(보존됨) + `coupon-price-set` EF 복원. 구매 시점 최신 tick 스냅샷(`coupon_purchases.unit_price`) — 이후 변동 무영향(시세 스냅샷 원칙과 동일) |
| C3 | 결제 | **코엠페이먼츠 SIMPLEPAY**(간편결제 — 결제창 리다이렉트형) = F14 구현 그대로 복원: `_shared/pg.ts` factory(`PG_PROVIDER: koem\|demo\|toss`, 기본 koem) + `_shared/koem.ts` + `coupon-purchase-intent/-return/-confirm` EF. 코엠은 서버 승인 API가 없어 **rUrl 콜백(coupon-purchase-return, verify_jwt=false)이 유일 확정 경로**. `PG_PROVIDER=demo`는 결제창 없이 즉시 충전(개발·데모 전용, 프로덕션 금지) |
| C4 | 원장 | 기존 규칙 그대로(00-domain 쿠폰 원장 절을 현역 복권): CHARGE(+, 구매)/CONSUME(−, 수락)/REFUND(+, 점주·시스템 귀책 취소 환급)/ADJUST(±, admin·PG환불). append-only 트리거·멱등 unique 2종·v_coupon_balance invoker 뷰 전부 보존분 재사용. **클라이언트 원장 쓰기 금지(절대 규칙 1)** |
| C5 | 좌상 실적 | **조회 전용** — 좌상 정산 체인(14)에 쿠폰은 편입하지 않는다. `v_dealer_rider_stats`에 `coupon_used_qty`(완료 주문 coupon_cost 합) 컬럼 추가. 경로는 반드시 `pickup_orders.coupon_cost` 경유(주문 RLS `p_orders_read_by_dealer`가 좌상 조회를 허용 — coupon_ledger는 본인+admin RLS라 좌상에게 항상 0행이므로 조인 금지). v_dealer_active_orders는 재무 컬럼 제외 원칙(16 L6) 유지 — 손대지 않는다 |
| C6 | UI | git `a4b4fdd^`의 07/F14 화면 원형(CouponPurchasePage 567줄·CouponLedgerPage·useCoupons·RiderCouponPanel)을 복원하되 **현행 규약으로 갱신**: 폐유 브랜드 토큰, 15 모션, 03 '레이아웃 강건성', 수량 프리셋 10/30/50 + 직접 입력, 잔액 카드는 PointBalanceCard 일반화 변형(label="보유 수거쿠폰"), 내역은 LedgerList `variant="coupon"`(둘 다 현 트리에 보존됨) |
| C7 | 지급 모델과의 관계 | 08 불변 — 쿠폰은 수락 게이트일 뿐, 계량·확인·지급(현금/포인트)·출금·신유 상계(14)에 일절 관여하지 않는다. CallCard/콜 상세의 "예상 매입 지급액" 표기도 불변, 쿠폰 소진량 칩만 병기 부활 |

## 2. 작업 순서 (Q-태스크)

| # | 작업 | 범위 |
|---|---|---|
| Q1 | 본 스펙 + 문서 동기화(00 쿠폰 절 현역 복권·08 P1 역전 기록·CLAUDE.md 문서 맵) | 【docs】 |
| Q2 | 서버 부활 — `a4b4fdd^`에서 `_shared/pg.ts`·`koem.ts`·`toss.ts`(+테스트)·coupon-* EF 6종 복원, core 쿠폰 zod/couponPurchase 복원 + vendor 재생성, order-create coupon_cost 스냅샷 재개, config.toml·DEPLOY.md 배선 | 【EF】【core】 |
| Q3 | rider 앱 — 쿠폰 잔액 카드(콜 홈)·충전 화면(/coupons/purchase, 코엠 리다이렉트+demo 분기+PENDING orphan 재시도)·쿠폰 내역(/coupons)·CallCard 소진 칩·수락 INSUFFICIENT_COUPON CTA | 【R】【ui】 |
| Q4 | admin — 쿠폰 단가 설정(PricePage 섹션 + coupon-price-set)·RiderCouponPanel(조정·환불)·판매 통계(v_coupon_sales_daily) 복원 | 【A】 |
| Q5 | 좌상 실적 — v_dealer_rider_stats `coupon_used_qty` 마이그레이션(+01 동기화·pgTAP) + dealerRiderStatsSchema + DealerHomePage 라이더 행 표기 | 【DB】【D】 |
| Q6 | 마감 — pgTAP(수락 게이트 부활·잔액 부족 409·환급 멱등)·게이트·qa-checklist·적대적 리뷰 | 【검증】 |

## 3. 리스크 레지스터

- [상] **코엠 실 승인 검증 불가(이 환경)** — F14와 동일하게 rUrl 콜백·해시 검증은 단위
  테스트로, 실 결제는 스테이징 실측 항목(🔴)으로 남긴다. 배포 전 `KOEM_MID`/`KOEM_API_KEY`
  시크릿 등록 + return URL 공개 배포 필수(DEPLOY.md).
- [중] **전환기 혼재** — 부활 시점 이전의 무쿠폰 주문(coupon_cost null)은 게이트 없이
  수락되는 것이 정상(레거시 규약 그대로). 잔존 PENDING 구매 24h TTL(F4 ③) 유지.
- [중] **라이더 온보딩 마찰** — 잔액 0인 기존 라이더는 충전 전까지 콜 수락 불가.
  콜 홈 잔액 카드 + 부족 토스트의 [충전하러 가기] CTA로 유도(07 F5 원형).
- [하] 쿠폰 비용의 좌상 오해 — C5는 조회 전용이며 정산 무관 카피를 표기한다.

## 4. 검증 기준

- pgTAP: coupon_cost 스냅샷 재개 후 ACCEPT가 CONSUME을 발행하고 잔액 부족이면
  `INSUFFICIENT_COUPON`으로 거부되는지(멱등 재수락 포함), 귀책 취소 REFUND 멱등.
- 단위: 코엠 파라미터·해시·return 파싱(F14 테스트 복원), 구매 플로우 demo 분기,
  잔액·내역 화면, 좌상 실적 컬럼.
- `pnpm lint/test/build` + pgTAP 전체 그린.

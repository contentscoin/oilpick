# 09 — 라이더 추천(레퍼럴) 시스템 (H-태스크)

2026-07-15 지시로 확정한 신규 기능 계획. 라이더가 점주(user)에게 앱 설치를 영업하는 성장 루프를
지원한다. 04/07/08과 같은 방식: **위에서부터 순서대로**, 각 태스크는 DoD 만족 시 종료.
이 문서가 레퍼럴 도메인의 단일 진실이다(08 피벗 위에 순수 추가 — 기존 상태머신·원장 규칙 승계).

표기: 【U】user 【R】rider 【A】admin 【core】packages/core 【ui】packages/ui 【DB】supabase

---

## 0. 신모델 정의

**목표**: 라이더가 자신의 **추천코드/추천링크**로 점주를 앱에 유입시킨다. 추천으로 가입한 점주가
**첫 수거를 완료(활성화)** 하면 점주에게 **추천 보너스 포인트**가 적립되고, 라이더에게는 **추천 실적**이
집계된다(라이더 보상은 08 P5 원칙대로 오프라인 정산·청구 근거로 기록). 관리자는 라이더별 추천
퍼널(가입→활성화→전환율)과 보너스 지급을 실적 분석으로 본다.

### 결정 기록
| # | 결정 | 확정 |
|---|---|---|
| H1 | 추천 주체·대상 | **라이더(referrer) → 점주(referred)**. 라이더가 영업 세일즈포스. 점주 1인당 추천 1회(선착순 최초 코드 확정) |
| H2 | 추천코드 | `rider_profiles.referral_code`(unique). 서버 생성 8자리(Crockford base32, 혼동문자 제외). Edge `referral-code`가 라이더 요청 시 없으면 생성해 반환. **attach 시 라이더 `verify_status='APPROVED'` 검증**(정지·미승인 코드는 무효) |
| H3 | 추천링크·딥링크 | 웹 랜딩 `/ref/:code`(user 앱 라우트) — 코드를 localStorage(`oilpick_referral_code`)에 저장 + 보너스 안내 + 설치/계속 CTA. 앱 스킴 `oilpick-user://ref/<code>` → 동일 라우트로 정규화(deeplink.ts). 라이더 공유 링크는 Edge(referral-code)가 `${REFERRAL_BASE_URL}/ref/<CODE>`로 조립해 shareUrl로 반환(REFERRAL_BASE_URL=Supabase 시크릿, 미설정 시 `REFERRAL_LINK_BASE`=`https://app.oilpick.kr`. 앱은 서버가 준 shareUrl 표시) |
| H4 | 코드 연결(attach) | 가입(supplier_profiles insert) **성공 직후** best-effort로 `referral-attach`(저장된 코드) 호출 — 실패해도 가입은 성립(비차단). 원장·referrals 쓰기는 service_role RPC에만(절대 규칙 1 확장) |
| H5 | 보너스 구조 | **점주 보너스**: 활성화 시 `point_ledger REFERRAL(+supplier_bonus)` 적립(출금 가능, EARN과 동일 취급). **라이더 보상**: `referrals.rider_reward` 스냅샷 — 라이더 지갑 없음(08), admin 통계·오프라인 정산 근거로만 기록. 금액은 core 상수 `REFERRAL_SUPPLIER_BONUS=5000` / `REFERRAL_RIDER_REWARD=3000`, **가입 시점 스냅샷**(이후 상수 변경 무영향) |
| H6 | 활성화 조건 | **추천 점주의 첫 수거 완료**(CONFIRM_MEASURE/FORCE_COMPLETE로 COMPLETED 도달). referrals.status `SIGNED_UP→ACTIVATED` 원자 전이 + 보너스 발행. 가짜 설치·가입 파밍 차단 |
| H7 | 활성화 트리거 지점 | **order-transition Edge Function**이 완료 전이 성공 후 `fn_activate_referral(supplier_id, order_id)` 호출(멱등 no-op). fn_transition_order 본체는 무변경(레퍼럴은 순수 추가 — 상태머신 오염 방지). 활성화 시 점주·라이더 푸시 |
| H8 | 라이더 보상 정산 처리(후속 확정 2026-07-16) | 오프라인 정산의 **지급 이력 마킹**: `referrals.reward_settled_at/reward_settled_by`(admin 기록). Edge `referral-settle`(admin) → `fn_settle_referral_reward` RPC(service_role — ACTIVATED만 허용, 멱등, 해제 지원). `v_referral_stats`에 settled/unsettled 합계 append. admin 레퍼럴 화면에 "보상 정산 큐"(미지급 목록+[지급 완료]+미지급 KPI). **원장 발행 없음** — 라이더 지갑 없음(08 P5) 원칙 유지, 실 지급은 오프라인·이 마킹은 그 이력이다 |

### 안티 어뷰즈 (모두 서버 강제)
- 점주 1인 1회: `referrals.referred_supplier_id unique`. 재-attach는 **같은 코드면 기존 행 반환(멱등)**,
  **다른 코드면 RPC가 `ALREADY_REFERRED` raise**(선착순 최초 확정 — 서버 단일 정규화 판정, H5 품질 패스 ⓔ).
- 자기추천 불가: 라이더≠점주(역할 상이) + RPC에서 `referrer_rider_id <> referred_supplier_id` 확인.
- 보너스는 **활성화 시에만**: SIGNED_UP→ACTIVATED 원자 전이가 유일한 발행 트리거. status 가드로 중복 발행 불가.
- 발행 멱등: `point_ledger unique(order_id, entry_type, user_id)` — 활성화 order_id를 dedup 축으로 사용.
- APPROVED 라이더 코드만 유효(attach 검증). 정지 라이더의 기존 추천은 유지(발행은 점주 활동 기준).

---

## 1. 도메인 규칙 (H1에서 00-domain.md에 반영)

### 1-1. 포인트 원장 — REFERRAL 항목 추가
- `ledger_type`에 `REFERRAL` 추가(alter type add value — 별도 마이그레이션). 점주 추천 보너스 적립.
- 부호 양수(잔액 증가). `v_point_balance`의 `else amount` 분기가 자동 포함(available 반영, 출금 가능).
- 발행 경로: `fn_activate_referral` → `fn_post_ledger(supplier,'REFERRAL',bonus,order_id)`. service_role 전용.

### 1-2. referrals (append 갱신 — status 전이만)
```
referral_status enum ('SIGNED_UP','ACTIVATED','CANCELLED')
referrals(
  id uuid pk,
  referrer_rider_id uuid not null fk rider_profiles,
  referred_supplier_id uuid not null unique fk supplier_profiles,  -- 점주 1인 1회
  code text not null,                       -- 사용된 코드 스냅샷
  status referral_status default 'SIGNED_UP',
  supplier_bonus int not null,              -- 활성화 시 점주 지급 포인트(스냅샷)
  rider_reward int not null,                -- 라이더 오프라인 정산 보상(스냅샷)
  signed_up_at timestamptz default now(),
  activated_at timestamptz,                 -- 활성화 시각
  activating_order_id uuid fk pickup_orders -- 활성화 유발 주문
)
```
- RLS: `referrer_rider_id=auth.uid() or referred_supplier_id=auth.uid() or is_admin()` (select). insert/update 정책 부재 = service_role RPC만.
- Realtime publication(라이더 실적 실시간 갱신용).

### 1-3. 통계 뷰
- `v_referral_stats`(security_invoker=true — referrals RLS 의존): 라이더별 집계
  (signed_up / activated / supplier_bonus_paid / rider_reward_earned — 전환율은 뷰 컬럼이 아니라
  core `referralConversionRate`로 클라이언트 파생 계산). 라이더는 본인 1행,
  admin은 전체를 본다(RLS가 자동 스코프).
- `v_referral_daily`(admin 게이트 — is_admin() + security_invoker): 일별 가입/활성화 추이.

### 1-4. 알림
| 이벤트 | 수신자 | 카피 |
|---|---|---|
| 추천 활성화(첫 수거 완료) | 점주 | "추천 보너스 N P가 적립됐어요 — 지갑에서 확인하세요" (link /wallet) |
| 추천 활성화 | 라이더 | "회원님 추천으로 가입한 점주가 첫 수거를 완료했어요 — 추천 실적이 적립됐어요" |

---

## H-태스크

### H1. 【docs】 스펙 반영
- 00-domain.md 포인트 원장 규칙에 REFERRAL 현역 항목 추가, "라이더 추천" 절 신설(요지+링크). 01-db-schema.sql
  DDL 반영(ledger_type REFERRAL, referral_status, rider_profiles.referral_code, referrals, 뷰 2종). 02-api.md
  referral-code/referral-attach 절 + order-transition 활성화 훅 기술. 03-frontend.md 3앱 레퍼럴 화면. CLAUDE.md 문서 맵.
- [x] 완료: 00-domain.md(포인트 원장 REFERRAL 현역 항목 + "라이더 추천 규칙" 절 신설), 01-db-schema.sql(전 DDL 동기화 —
  H2에서 완료), 02-api.md(§16 referral-code·§17 referral-attach + order-transition 활성화 훅), 03-frontend.md(3앱
  레퍼럴 화면 개정 블록 + 딥링크/추천링크 베이스), CLAUDE.md(문서 맵에 09-referral.md 추가).

### H2. 【DB】 마이그레이션 + RPC + 뷰 + pgTAP
- referral_status enum + ledger_type REFERRAL(별도 파일) + rider_profiles.referral_code + referrals + RLS +
  Realtime + `fn_attach_referral`/`fn_activate_referral`(revoke all/grant service_role) + v_referral_stats/
  v_referral_daily. pgTAP: attach(코드 검증·자기추천·중복·미승인 라이더 거부), 활성화(SIGNED_UP→ACTIVATED+
  REFERRAL 발행·멱등·이미 활성화 no-op), 통계 뷰 집계, RLS 격리.
- DoD: db reset + pgTAP green. 01 동기화.
- [x] 완료: 20260715000003(ledger REFERRAL) + 20260715000004(referral_status/referral_code/referrals/RLS/Realtime/
  v_referral_stats/v_referral_daily/fn_attach_referral/fn_activate_referral). pgTAP 09_referral_test.sql green —
  당시 17 asserts, 이후 H5 ①(교차일 버킷 +3)·품질 패스 ⓔ(ALREADY_REFERRED +2)로 **최종 22 asserts**(하네스
  9스위트 151). 01-db-schema.sql 동기화 완료(enum·컬럼·테이블·뷰2·RLS·publication·RPC 계약).

### H3. 【core】【API】 계약 + Edge
- core: `referralCodeOutputSchema`/`referralAttachInputSchema`, 상수 `REFERRAL_SUPPLIER_BONUS/REFERRAL_RIDER_REWARD/
  REFERRAL_CODE_STORAGE_KEY/REFERRAL_LINK_BASE`, errorCodes `INVALID_REFERRAL_CODE`/`ALREADY_REFERRED`.
  Edge: `referral-code`(rider — 없으면 생성·반환), `referral-attach`(supplier — 코드 연결, best-effort).
  order-transition: 완료 전이 후 fn_activate_referral 호출 + 활성화 알림. vendor 재빌드.
- DoD: lint/test/build green. zod·notify 단위 테스트.
- [x] 완료: core에 referralStatusSchema/referralCodeSchema/referralCode·Attach·Stats 스키마 + 상수
  REFERRAL_SUPPLIER_BONUS(5000)/REFERRAL_RIDER_REWARD(3000)/REFERRAL_CODE_STORAGE_KEY/REFERRAL_LINK_BASE/
  REFERRAL_STATUS_LABEL + errorCodes INVALID_REFERRAL_CODE/ALREADY_REFERRED + referral.ts(generateReferralCode/
  normalizeReferralCode/buildReferralShareUrl, 알파벳·길이). referral.test.ts 당시 14케이스(품질 패스 ⓐ
  referralConversionRate 2건 추가로 최종 16). Edge: referral-code(rider
  코드 발급/멱등·충돌 재시도), referral-attach(supplier best-effort·ALREADY_REFERRED 감지), order-transition에
  activateReferralIfAny 훅(COMPLETED 도달 시 fn_activate_referral + 점주/라이더 알림). config.toml 2엔드포인트 등록.
  vendor 재빌드(referral 모듈 포함). lint/test green.

### H4. 【R】【U】【A】 앱
- 【R】 "내 추천" 화면(/referrals): 내 코드·공유 링크(복사/공유) + 내 실적(가입/활성화/전환율/보상). 마이 진입점.
- 【U】 랜딩 `/ref/:code`(코드 저장+보너스 안내+CTA) + 딥링크 핸들러 + AuthPage 가입 후 attach + WalletPage 추천 보너스 표시(LedgerList REFERRAL 라벨).
- 【A】 레퍼럴 실적분석 페이지(/referrals): 라이더별 퍼널 테이블(v_referral_stats) + 일별 추이(v_referral_daily) + CSV.
- DoD: 각 화면 vitest. lint/test/build green.
- [x] 완료:【R】ReferralsPage(/referrals — 코드·공유링크 복사/공유 + 가입/활성화/전환율/누적보상, useReferral
  코드발급·실적+referrals Realtime) + MyPage "내 추천" 진입점.【U】RefLandingPage(/ref/:code — 코드 저장+보너스
  안내+CTA, AuthGuard 밖) + 딥링크(oilpick-user://ref/<code> 정규화, deeplink 테스트) + AuthPage 가입 후
  attach(best-effort) + LedgerList REFERRAL "추천 보너스" 라벨.【A】ReferralsPage(/referrals — KPI+라이더 퍼널
  +일별 추이 + CSV 2종, useReferralAdmin) + AdminShell "레퍼럴" 내비. 각 화면 vitest(rider 3·user 4+딥링크1·
  admin 4). lint/test/build green.

### H5. 【검증】 게이트 + 리뷰 + PR
- lint/test/build + DB 하네스 green, 어드버서리얼 리뷰, 커밋/푸시.
- [x] 완료: lint 7/7·test 7/7·build 5/5·DB 하네스 9스위트(09 22 asserts) green. 3층 병렬 어드버서리얼 리뷰
  (DB/Edge+core/앱) — 확정 결함 3건 수정:
  ① [DB] v_referral_daily가 "같은 날 활성화"만 세어 활성화 추이가 거의 항상 0 → 가입/활성화를 각자 날짜로
     버킷팅(UNION ALL)하도록 재작성 + 컬럼 activated_same_day→activated + pgTAP 교차일 회귀 테스트 3건 추가.
  ② [앱-admin] useReferralStatsAdmin이 한 페이지에서 2회 마운트되며 고정 채널 토픽 공유 → Realtime 결함
     (useRiderProfile 선례). 훅을 ReferralsPage 부모에서 1회 마운트해 props로 내리는 구조로 근본 수정(품질 패스에서).
  ③ [앱-R/A] 라이더 보상(원 단위, 08 P5)을 formatPoint("P")로 표기 → formatKrw("원")로 수정.
  Edge+core 리뷰는 확정 결함 0(정규식↔알파벳·RPC 시그니처·멱등·best-effort 훅 정상). PR #16(08 위에 스택).
- [x] 품질·단순화 패스(4각 병렬: 재사용/단순화/효율/고도): ⓐ 전환율 계산을 core `referralConversionRate`로
  추출(rider/admin 3곳 중복 제거) ⓑ admin `fetchDisplayNameMap`/`sinceIso`를 `lib/adminQueries`로 공용화
  (useSettlementAdmin 중복 제거) ⓒ admin 퍼널 훅 부모 1회 마운트(②의 근본 수정, 채널 1개) ⓓ RefLandingPage
  useMemo 제거·`typeScale.headline` 토큰화 ⓔ `ALREADY_REFERRED`를 Edge 문자열 비교 → RPC raise로 이관
  (서버 단일 정규화 판정, INVALID_REFERRAL_CODE와 일관 + pgTAP 2건) ⓕ 공유 링크 base는 Edge `REFERRAL_BASE_URL`
  단일 소스임을 문서·상수 주석 정정(허상 VITE_ env 제거). 전 게이트 재-green.

### H6. 【후속】 라이더 보상 정산 처리 (H8 결정)
- 【DB】 `referrals.reward_settled_at timestamptz / reward_settled_by uuid fk profiles` + `fn_settle_referral_reward
  (p_referral_id, p_admin_id, p_settle boolean)`(SECURITY DEFINER·service_role 전용 — ACTIVATED 아니면
  raise 'INVALID_TRANSITION', 재정산 멱등, p_settle=false로 해제) + `v_referral_stats`에
  `rider_reward_settled`/`rider_reward_unsettled` append(교체 뷰 — 기존 컬럼 순서 불변). pgTAP.
- 【core】【API】 `referralSettleInputSchema({referralId, settle})`/출력. Edge `referral-settle`(admin role
  검증 → RPC 위임, INVALID_TRANSITION/NOT_FOUND 매핑). 02-api.md §18. vendor 재빌드.
- 【A】 레퍼럴 화면에 "보상 정산 큐" 섹션: ACTIVATED·미정산 목록(라이더/점주/보상액/활성화일) + [지급 완료]
  (+실행 취소) + 미지급 합계 KPI. 퍼널 테이블에 정산/미정산 컬럼. referrals Realtime이 기존 채널로 갱신.
- 【R】 rider "내 추천" 누적 보상에 "정산 완료 N원" 보조 표기(선택 — 뷰 컬럼 추가로 무료).
- DoD: pgTAP + zod/화면 vitest, lint/test/build + 하네스 green, 01/00/02/03 동기화.
- [x] 완료(2026-07-16): 20260716000001(reward_settled_at/by + v_referral_stats settled/unsettled append +
  fn_settle_referral_reward — NOT_FOUND/INVALID_TRANSITION raise·멱등·해제). pgTAP +6(총 28, 하네스 157).
  core referralSettleInput/Output + referralStatsSchema 확장. Edge referral-settle(admin) + config.toml +
  vendor 재빌드.【A】보상 정산 큐(미지급 목록+[지급 완료]+미지급 합계, useUnsettledReferrals) + 퍼널
  정산/미지급 컬럼·CSV 확장(테스트 +4).【R】누적 보상 "정산 완료·대기" 분리 표기(테스트 +1).
  01/00/02(§18)/03 동기화. lint 7/7·test 7/7(admin 107·rider 100)·build 5/5·하네스 9스위트 green.

## 스코프 밖
- 실 앱스토어/플레이스토어 URL·유니버설 링크(Branch 등) 인프라 — 랜딩이 env 스토어 링크 플레이스홀더로 대체.
- 다단계(2-tier) 추천·추천 유효기간·부정탐지 고도화 — 필요 시 후속.

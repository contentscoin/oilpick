# QA 체크리스트

역할 × 핵심 플로우 × 예외 케이스 매트릭스와 자체 점검 결과를 기록한다.
(T13 최초 작성 → 2026-07-16 **08 지급수단 피벗·09 레퍼럴 반영 전면 갱신**. 07 이전 결과 중
현행 모델에서 소멸한 플로우는 표에서 제거하고 "레거시" 절로 이동.)

**범례**: ✅ 통과(자동 테스트 또는 로컬 실측) · ⚠️ 부분/폴백만 검증 ·
🔴 이 환경에서 검증 불가 → **런칭 전 실기기/CI 검증 필요**

> 이 문서는 "이 개발 환경에서 무엇을 실제로 검증했고 무엇을 검증하지 못했는지"를 정직하게
> 남기는 것이 목적이다. 미검증 항목은 숨기지 않고 🔴로 명시한다. 검증 수단 표기:
> [단위]=vitest, [pgTAP]=DB 하네스(CI 포함), [실측]=브라우저/스택 실구동, [정적]=코드 리뷰만.
> ⚠️ 08/09 시점의 이 환경은 **docker/Supabase 로컬 스택 불가** — T9~T13의 "2-브라우저 실측"
> 방식은 재현 불가라, 08/09 플로우는 pgTAP(로컬 Postgres 하네스)+단위테스트+헤드리스 브라우저
> 렌더로 검증 수준을 대체했다(아래 각 행에 명시).

---

## 1. 공급자(supplier / apps/user)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 온보딩 | 슬라이드 3장, localStorage 1회 플래그 | 재방문 시 스킵 | ✅ [단위] |
| 가입/로그인(U2) | 전화 OTP → profiles+supplier_profiles | 잘못된 코드/형식 400, E.164 변환 | ✅ [단위, test_otp] |
| **가입 후 추천 attach(09)** | 저장된 코드로 referral-attach(best-effort) + 키 소비 | 형식 위반 스킵·실패해도 가입 성립(비차단)·무코드 무호출 | ✅ [단위 4케이스] |
| **좌상 조직(13 I1)** | role 'dealer'·dealer_id·RLS 5정책·통계 뷰 | 좌상 자기 소속만 조회, 남/미배정 미노출, dealer_id 셀프변경 차단 | ✅ [pgTAP 14 asserts] |
| **좌상 관리(13 I3 admin)** | /dealers 계정 생성(dealer-create)+라이더 배정(dealer-assign) | 중복 아이디 409, 비좌상 배정 400 | ⚠️ [단위: 셸 role 분기] / Edge 실호출 🔴 |
| **좌상 관할(13 I4 dealer)** | 관할 대시보드+승인(rider-verify 자기소속)+실적 CSV | 남 소속 승인 403(서버), 정산 화면 없음(D5) | ⚠️ [단위: DealerHomePage] / Edge·RLS E2E 🔴 |
| **라이더 소속 표시(13 I5)** | 마이페이지 "소속: {좌상 상호}" | 미배정 미표기 | ⚠️ [RLS pgTAP] / 앱 실조회 🔴 |
| **추천 랜딩 /ref/:code(09)** | 코드 정규화·localStorage 저장·보너스 카드·가입 CTA | 무효 코드 폴백 카드(저장 안 함), 로그인 시 홈 CTA | ✅ [단위 4 + **헤드리스 Chromium 실측**] |
| 주소 등록 | 카카오 주소검색 → lat/lng | 키 없으면 수동 텍스트 입력 폴백 | ⚠️ 폴백만(실 SDK 🔴) |
| **지도 렌더러(11 M8)** | MapLibre GL — VITE_MAP_STYLE_URL 게이트, 미설정 시 프리뷰 폴백 | 로드/WebGL 실패 시 프리뷰 강등(크래시 금지) | ⚠️ 단위 4케이스·폴백 ✅ / 실타일 렌더·Capacitor WebView WebGL 🔴 |
| **내비 핸드오프(11 M9-a)** | kakaomap://route에 실좌표(ep=lat,lng) + TMap/웹 폴백 | 좌표 파싱 실패 시 주소 검색 링크 강등 | ⚠️ 단위(URL 조립·강등) ✅ / 실기기 앱 호출 🔴 |
| 홈(U3, 08) | PriceChart v2 + 이번 달 수령 요약 **현금/포인트 분리** + 포인트 잔액 칩 | 진행중 주문 상단 고정 | ✅ [단위] |
| 시세 상세(U4, 08) | PriceChart v2(마커/눈금/스크럽) + PriceStatsRow | 데이터 없음 스켈레톤/빈 표 | ✅ [단위] |
| 수거 요청(U5, 08) | 18L 말통/10L/직접 kg 프리셋 → order-create | "현장 계량 기준 확정"·"예상 수령액"(수단 중립) 고지 | ✅ [단위] |
| 주문 상태(U6~U9) | status 분기, Realtime 자동 갱신 | REQUESTED 취소, 무수락 자동취소 표시 | ✅ [단위] |
| 계량 확인(08) | 사진 뷰어 + 확정 kg + **지급수단별 확인 카피**(현금 수령/포인트 적립) | [확인]/[이의신청] 분기. POINT면 CONFIRM과 원자 EARN 발행 | ✅ [단위 + pgTAP(EARN 멱등·CASH 무발행)] |
| 이력(U10) | 페이지네이션 리스트 | 빈 상태 EmptyState | ✅ [단위] |
| 지갑(U11, 08·09) | 잔액 히어로+[출금 신청] + 포인트 내역(**REFERRAL "추천 보너스" 라벨**) + 수령 이력(PayoutMethodChip) | 원장 없음 EmptyState, 최소액 미만 CTA 비활성 | ✅ [단위] |
| 출금(U12, 08 부활) | 계좌 등록 + 금액(최소 1만P) → withdraw-request | 잔액 부족 400, 반려 시 WITHDRAW_CANCEL 복구 표시 | ✅ [단위 + pgTAP(신청→반려 왕복 잔액 원복)] |
| 알림함(U14) | Realtime 구독 + 읽음 처리 | 알림 없음 EmptyState | ✅ [단위] |

## 2. 라이더(rider / apps/rider)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 서류 제출(R1) | 3종 업로드 → PENDING 대기 | Realtime로 승인 자동 전환 | ✅ [단위] |
| 콜 홈(R2, 08) | 온라인 토글 + 오늘 실적(**현금/포인트 분리**) + 콜 목록(거리순) | 콜 없음 EmptyState, 오프라인 안내 | ✅ [단위] |
| 콜 상세(R3, 08) | "예상 매입 지급액" 대형 표시 + [수락](쿠폰 게이트 없음) | 409 "다른 라이더 수락" 토스트 후 복귀, SUSPENDED 수락 차단 | ✅ [단위 + pgTAP(verify 게이트·동시수락)] |
| 운행(R4~R6, 08) | 도착 → 계량+사진+**지급수단 세그먼트(필수)** → 제출 후 수단별 안내 | 재제출 수단 변경 가능(중재 확정 전), DISPUTED 안내 패널 | ✅ [단위 + pgTAP(payoutMethod 검증·CASH 폴백)] |
| 위치 업로드 | 운행 중 15초 간격 rider-location | 진행중 주문 없으면 400 거부 | ✅ [단위] |
| 실적(R7, 08) | 이번 달 **현금 지급/포인트 지급 분리**(건수/kg/금액) | 데이터 없음 0 표기 | ✅ [단위] |
| **내 추천(/referrals, 09)** | 코드·공유 링크(복사/공유) + 실적(가입/활성화/전환율/누적 보상 — 원 단위) | 코드 로드 실패 재시도, 실적 없음 0, referrals Realtime 갱신 | ✅ [단위: 화면 3 + 훅 6] |
| 인증 카드(R9) | 사진/이름/차량 + rider_id QR | — | ✅ [단위] |
| 알림함(R11) | Realtime 구독 + 읽음 + **링크 rider 라우트 재매핑**(/orders/:id→/calls/:id, /wallet→/earnings) | raw 링크 캐치올 낙하 회귀 방지 | ✅ [단위 — 교차 이음새 감사 수정] |

## 3. 관리자(admin / apps/admin)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 로그인 | 아이디/비밀번호(내부 @oilpick.local 매핑) | role≠admin 접근 차단 | ✅ [단위] |
| 대시보드(08) | 지도 핀 + KPI(주문/kg/**현금 지급/포인트 지급/출금 대기**/활성 라이더) | 빈 목록 안내, null 방어 | ✅ [단위(KPI 집계)] |
| 시세 관리(08) | 현재값 + price-set + tick 이력/미니 차트(v2) | — | ✅ [단위] |
| 주문 관리 | 상태 필터 테이블 + 상세 드로어(지급수단 칩·귀책 취소·FORCE_COMPLETE) | DISPUTED RESOLVE_DISPUTE(finalKg), ARRIVED 24h 하이라이트 | ✅ [단위] |
| 회원 관리 | supplier/rider 탭, PENDING 승인/반려, 정지/해제 | 빈 큐 안내 | ✅ [단위] |
| 정산(08) | 출금 큐(승인/반려/지급) + 수거 추이 + **라이더별 지급 실적** + 원장 감사 + CSV | 상태별 버튼, 쿼리 실패 에러 표면화 | ✅ [단위] |
| **레퍼럴(/referrals, 09)** | KPI(가입/활성화/전환율/보너스) + 퍼널 테이블 + 일별 추이 + CSV 2종 | 실적 없음 안내, referrals Realtime 갱신 | ✅ [단위: 화면 4 + 훅 2] |
| **알림 벨(신설)** | 미읽음 배지 + 패널, 행 클릭 → 읽음 + /orders?order=<id> 드로어 딥링크 | 미지 경로 no-op(캐치올 방지), 빈 안내 | ✅ [단위: 벨 6 + 재매퍼 3 — 교차 이음새 감사 수정] |
| 공지 | 전체/역할별 푸시 발송 폼 | notify-broadcast(FCM 없으면 로그+notifications만) | ⚠️ 실 발송 🔴 |

## 4. 크로스 역할 시나리오 (08/09 — 검증 수단 명시)

> T9~T13의 2-브라우저 실측은 07 이전 모델 기준이다. 08/09 시점 이 환경은 로컬 Supabase 스택
> 불가(docker 부재) — 아래 시나리오는 **DB 하네스(pgTAP, RPC 레벨 실구동)** + 단위테스트로
> 검증했고, 스택 전제 E2E는 🔴로 남긴다.

| 시나리오 | 상태 |
|---|---|
| 요청 → 수락 → 계량+지급수단(POINT) → 점주 확인 → **EARN 원자 발행(멱등)** → 출금 신청→처리 | ✅ [pgTAP: 상태머신+원장+출금 왕복] / 스택 E2E 🔴 |
| CASH 완료 주문은 point_ledger 무변경 | ✅ [pgTAP] |
| 동시 수락 레이스: 두 rider 동시 수락 → 하나만 성공(409) | ✅ [pgTAP(조건부 update)] |
| 이의신청 → RESOLVE_DISPUTE(finalKg 고정) → 일반 CONFIRM 경로로 완료 | ✅ [pgTAP] |
| 30분 무수락 → 자동취소(NO_RIDER) | ✅ [pgTAP(order-expire RPC)] |
| **레퍼럴 루프(09)**: attach(오코드/미승인/자기추천/중복 거부) → 첫 수거 완료 → ACTIVATED + REFERRAL 5000 발행(멱등) → 통계 뷰 집계 | ✅ [pgTAP 22 asserts] / order-transition Edge 훅은 Deno 부재로 [정적] + 시그니처 교차검증 — 스택 E2E 🔴 |
| 레퍼럴 어뷰즈: 다른 코드 재-attach → ALREADY_REFERRED, 재활성화 no-op, 추천 없는 점주 no-op | ✅ [pgTAP] |

---

## 5. 공통 예외 처리 (03-frontend.md "공통 규칙")

| 항목 | 구현 | 상태 |
|---|---|---|
| **오프라인 배너** | `packages/ui` `OfflineBanner`, user/rider App 루트 고정 마운트 | ✅ [단위+실측(T13)] |
| **네트워크 재시도** | TanStack Query `retry: 1` + `refetchOnReconnect: true`(3앱), Toast 재시도 | ✅ |
| **에러 표시** | errorCodes → 한글 메시지 맵(`ERROR_MESSAGE_KO`), Edge envelope 파싱 | ✅ |
| **빈 상태** | 주요 리스트(이력/콜/알림/원장/큐/레퍼럴)에 EmptyState 또는 안내 | ✅ |
| **로딩 스켈레톤** | 시세/잔액 카드·리스트는 스켈레톤(스피너 금지) | ✅ |
| **쿼리 실패 표면화** | 실패를 빈 상태로 위장하지 않음 — QueryError/재시도 버튼(3앱) | ✅ [단위] |

---

## 6. Supabase advisors (보안/성능)

T13에서 로컬 스택 advisor lint를 점검·수정했다(상세는 이력 참조). 08/09 신규 객체도 동일
원칙을 따른다:

| 항목 | 결과 |
|---|---|
| 08/09 신규 뷰(v_pickup_stats_daily 확장·v_rider_payout_daily·v_referral_stats·v_referral_daily) | ✅ 전부 `security_invoker=true`(+admin 게이트는 is_admin()) — security_definer_view 0 |
| 08/09 신규 함수(fn_transition_order 개정·fn_attach_referral·fn_activate_referral) | ✅ `search_path=public` 고정 + revoke all/grant service_role |
| referrals RLS | ✅ select 정책만(referrer/referred/admin) — insert/update 정책 부재 = service_role RPC 전용. pgTAP로 비소유 read 0행·클라이언트 write 거부 실측 |
| `rls_disabled_in_public`(PostGIS `spatial_ref_sys`)·`unindexed_foreign_keys`(관리 FK, INFO) | ⚠️ 의도적 잔존(T13 판단 유지) |

---

## 7. 이 환경에서 검증 불가 — 런칭 전 실기기/CI 검증 필요 🔴

`04-tasks.md` 질문 목록에 사유가 상세히 기록돼 있다. 요약:

| 항목 | 사유 | 런칭 전 필요 검증 |
|---|---|---|
| **실제 FCM 푸시 수신** | `FCM_SERVICE_ACCOUNT` 자격증명 없음(notifications 기록은 항상 수행) | 키 발급 → secret 등록 → 실기기 수신 확인(레퍼럴 활성화 푸시 포함) |
| **Edge Functions 런타임 실행** | 08/09 시점 Deno·Supabase 스택 부재 — referral-code/referral-attach/order-transition 활성화 훅은 정적 검증 + RPC 시그니처 교차검증 + vendor 번들 확인만 | `supabase functions serve`로 curl 시나리오(02-api.md §16·§17) 실행 |
| **스택 전제 E2E**(08/09 플로우) | docker 부재로 2-브라우저 실측 불가 — pgTAP+단위로 대체 | CI/스테이징에서 요청→지급→출금, 레퍼럴 가입→활성화 전 구간 |
| **딥링크 탭 이동** | 네이티브 앱 미기동 | `oilpick-user://ref/:code` 포함 실제 라우팅(정규화·재매핑 로직은 단위 ✅) |
| **카카오맵 실렌더** | `VITE_KAKAO_KEY` 없음(폴백 UI만) | 실 키 주입 후 지도/마커 육안 확인 |
| **실 SMS OTP** | Twilio 등 미연동(test_otp만) | 프로덕션 SMS 프로바이더 연동 후 실 발송 |
| **레퍼럴 공유 시트** | navigator.share는 실기기 전용(폴백=클립보드 복사, 단위 ✅) | 실기기에서 공유 시트 노출 확인 |
| **브랜드 아이콘/스플래시** | 임시 placeholder | 실 로고 교체 후 재생성 |

### 레거시(현행 모델에서 소멸 — 신규 검증 불필요)
- ~~카메라 QR 스캔·집하장 배송~~ (07 F13 소멸. 잔존분 완결 코드만 보존 — pgTAP 04_legacy_flow가 회귀 커버)
- ~~쿠폰 구매/충전/환불 UI~~ (08 P1 폐기. DB 레거시 보존은 pgTAP 05가 회귀 커버)
- ~~구모델 라이더 포인트 지갑(R7/R8 출금)~~ (07 F6 재정의 — 라이더 지갑 없음, 08 P5)

---

## 8. 자동 테스트 현황 (2026-08-02, 16 L 반영)

`pnpm test` 전체 통과. (커밋 전 `pnpm lint && pnpm test && pnpm build` 필수)

| 패키지 | 테스트 수 |
|---|---|
| @oilpick/core | 393 |
| @oilpick/ui | 149 |
| @oilpick/user | 152 |
| @oilpick/rider | 132 |
| @oilpick/admin | 124 |

DB 계층: pgTAP **17스위트 265 asserts**(`bash scripts/pgtap-local/run.sh` 전체 GREEN — 마이그레이션 50건).
Deno: `_shared` 순수 헬퍼 테스트(std-assert·notifyDedupe 12·creditWatch 4).
숫자가 바뀌면 이 표와 supabase/tests/README.md를 함께 갱신할 것.

## 9. 16 운영편의성(L) 점검 (2026-08-02)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 콜 정렬 토글(R2, L3) | 가까운순 기본·지급액순·최신순 | 위치 거부 시 가까운순=서버 순서 유지 | ✅ [단위] |
| 도로 경로·ETA(R3/R4, L3) | 콜 상세 "도로 기준" 칩 + 운행 지도 경로선 | 위치 거부·KAKAO 키 미설정 → 미표기 폴백 ✅ 실 키 실측 완료(2026-08-03, 11) | ✅ [단위 — 폴백 경로] |
| 방문 순서 보드(R4, L3) | ARRIVED 고정→근거리순 뱃지 ①②③+거리 칩 | 좌표 null 맨 뒤, 위치 없으면 뱃지 미표기 | ✅ [단위] |
| 콜 알림음 토글(R12, L3) | 토글↔CallAlertListener 실배선(mute=소리만) | 레거시 키 1회 이관 | ✅ [단위: 스토어 3 + MyPage] |
| 계량 드래프트(R5, L4) | 입력 즉시 저장→재진입 복원 배너→성공 시 파기 | 중재 완료 파기·제출 직전 상태 재확인·업로드 체크포인트 재사용·7일 만료 | ✅ [단위: 저장소 6 + 화면 5] |
| 확인 리마인드(L5) | 제출 2h/12h supplier·24h admin 자동 + 라이더 수동 버튼(2h 1회) | 재제출 시 사다리 리셋, cron 공백 후 몰림 상한 | ✅ [deno 12 + 단위 3] — cron 배선은 배포(DEPLOY §1-4) 🔴 |
| 좌상 관제(L6) | 진행중 목록+지연 배지+라이더 전화 | 타 좌상 0건·재무 컬럼 부재·재배정 표시명 폴백 | ✅ [단위 4 + pgTAP 8] |
| 정산 셀프서비스(L7) | 미정산 라인(usage 1:1 대사)+청구 CSV | 미정산 없음 빈 상태, CSV는 본인 청구만(RLS) | ✅ [단위 3+1] |
| 정산 워치(L8) | 80% 밴드·임계 경보(좌상+admin, 24h dedupe) | 한도 0 제외, 자동청구 없음 유지 | ✅ [deno 4] — cron 배선 🔴 |
| 관리 액션 4종(L9) | 승인/반려(사유)/정지(사유)/정지 해제 + 확인 다이얼로그 | 사유 없인 확정 불가, 취소 시 무실행 | ✅ [단위 4] |
| 내 정산 카드(R7, L9) | 이번 달 포인트 지급분 합계+정산 완료 푸시 | 지갑 오해 차단 카피, 타 라이더 0건 | ✅ [단위 2 + pgTAP 6] |
| 일별 지급 내역(R7, L9 확장 2026-08-05) | 일별 건수/kg + 현금·포인트 지급액 병기(접이식→카드 분리) | 현금 부호 보존(음수=상계 차액 지급), 현장 지급 완료분 카피, 실적 없으면 미노출 | ✅ [단위 3] |
| 건별 지급 내역(R7, L9 확장 2026-08-05 ②) | 날짜 행 펼침 → 시각·주소·kg·수단별 지급액 | net 규약(coalesce net_amount)·UTC 일자 묶음으로 일별 행과 합 일치, 지급 없음(null) 구분 | ✅ [단위 2 + 훅 2] |
| 글자 확대·폭 강건성(M, 03 '레이아웃 강건성' 절) | 전 화면: Firefox 텍스트만 확대 150~200% × 320/480px 폭에서 겹침·잘림·페이지 가로 스크롤 없음 | nowrap 3종 세트(ellipsis+hidden+minWidth:0), 텍스트 고정 height/width 금지, 정보 행 flexWrap | 🔲 [신규 화면마다 수동 QA] |

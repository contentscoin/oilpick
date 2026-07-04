# QA 체크리스트 (T13 자체 점검)

역할 × 핵심 플로우 × 예외 케이스 매트릭스와 이번 마감(T13) 자체 점검 결과를 기록한다.

**범례**: ✅ 통과(자동 테스트 또는 로컬 브라우저/스택 실측) · ⚠️ 부분/폴백만 검증 ·
🔴 이 환경에서 검증 불가 → **런칭 전 실기기/CI 검증 필요**

> 이 문서는 "이 개발 환경에서 무엇을 실제로 검증했고 무엇을 검증하지 못했는지"를 정직하게
> 남기는 것이 목적이다. 미검증 항목은 숨기지 않고 🔴로 명시한다. 자세한 환경 제약 사유는
> `04-tasks.md`의 "질문 목록"에 태스크별로 기록돼 있다.

---

## 1. 공급자(supplier / apps/user)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 온보딩 | 슬라이드 3장, localStorage 1회 플래그 | 재방문 시 스킵 | ✅ |
| 가입/로그인(U2) | 전화 OTP → profiles+supplier_profiles | 잘못된 코드/형식 400, E.164 변환 | ✅ (test_otp) |
| 주소 등록 | 카카오 주소검색 → lat/lng | 키 없으면 수동 텍스트 입력 폴백 | ⚠️ 폴백만(실 SDK 🔴) |
| 홈(U3) | PriceCard(Realtime) + 예상 포인트 실시간 | 진행중 주문 상단 카드 고정 | ✅ |
| 시세 상세(U4) | recharts + 최근 30 tick 테이블 | 데이터 없음 시 스켈레톤/빈 표 | ✅ |
| 수거 요청(U5) | 3스텝 → order-create → /orders/:id | "현장 계량 기준" 고지 | ✅ |
| 주문 상태(U6~U9) | status 분기, Realtime 자동 갱신 | REQUESTED 취소, 콜 무수락 자동취소 표시 | ✅ |
| 계량 확인 | 사진 뷰어 + 확정 kg + 포인트 미리보기 | [확인]/[이의신청] 분기 | ✅ |
| 이력(U10) | 페이지네이션 리스트 | **빈 상태 EmptyState** | ✅ |
| 지갑(U11) | PointBalanceCard + LedgerList | **원장 없음 EmptyState**, 잔액 스켈레톤 | ✅ |
| 출금(U12) | 계좌 등록 + 금액(최소 1만P 검증) | 잔액 부족 400, 최소액 미만 거부 | ✅ |
| 알림함(U14) | Realtime 구독 + 읽음 처리 | **알림 없음 EmptyState** | ✅ |

## 2. 라이더(rider / apps/rider)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 서류 제출(R1) | 3종 업로드 → PENDING 대기 | Realtime로 승인 자동 전환 | ✅ |
| 콜 홈(R2) | 온라인 토글 + 오늘 실적 + 콜 목록(거리순) | **콜 없음 EmptyState**, 오프라인 안내 | ✅ |
| 콜 상세(R3) | 수거비 대형 표시 + [수락] | 409 "다른 라이더 수락" 토스트 후 목록 복귀 | ✅ |
| 운행(R4~R6) | 도착 → 계량+사진 → QR 배송완료 | 잘못된 QR `INVALID_QR` 토스트 | ✅ (QR 수동입력 폴백) |
| 위치 업로드 | 운행 중 15초 간격 rider-location | 진행중 주문 없으면 400 거부 | ✅ |
| 정산(R7/R8) | PointBalanceCard(held 강조) + 일/주 합계 | **원장 없음 EmptyState** | ✅ |
| 인증 카드(R9) | 사진/이름/차량 + rider_id QR | — | ✅ |
| 알림함(R11) | Realtime 구독 + 읽음 | **알림 없음 EmptyState** | ✅ |

## 3. 관리자(admin / apps/admin)

| 플로우 | 정상 | 예외 케이스 | 상태 |
|---|---|---|---|
| 로그인 | 이메일/비밀번호(시드 admin) | role≠admin 접근 차단 | ✅ |
| 대시보드 | 진행 주문·온라인 라이더 핀 + 오늘 KPI 4개 | 빈 목록 안내, KPI 집계(null 방어) | ✅ (KPI 집계 단위테스트) |
| 시세 관리 | 현재값 + price-set + tick 이력/차트 | — | ✅ |
| 주문 관리 | 상태 필터 테이블 + 상세 드로어 | DISPUTED RESOLVE_DISPUTE(finalKg), CANCEL | ✅ (필터/라벨/kg 표시 단위테스트) |
| 회원 관리 | supplier/rider 탭, PENDING 승인/반려 | 빈 큐 안내 | ✅ |
| 정산 | 출금 큐(승인/반려/이체완료) + 원장 감사 | 상태별 버튼 노출, 상태 라벨 | ✅ (출금 상태전이 단위테스트) |
| 집하장 | CRUD + QR 인쇄 뷰 | 빈 목록 안내 | ✅ |
| 공지 | 전체/역할별 푸시 발송 폼 | notify-broadcast(FCM 없으면 로그+notifications만) | ⚠️ 실 발송 🔴 |

## 4. 크로스 역할 E2E (2-브라우저 로컬 실측)

| 시나리오 | 상태 |
|---|---|
| user 요청 → rider 수락 → 계량+사진 → user 확인 → QR 배송완료 → 양쪽 포인트 반영 | ✅ (T9 브라우저 실측) |
| 동시 수락 레이스: 두 rider 동시 수락 → 하나만 성공(409) | ✅ (조건부 update 검증) |
| 출금 신청 → admin 승인/반려 → 원장 Realtime 반영 | ✅ (T10 브라우저 실측) |
| 이의신청 → admin RESOLVE_DISPUTE(finalKg) → 포인트 재지급 | ✅ |
| 30분 무수락 → 시스템 자동취소(NO_RIDER) | ✅ (order-expire RPC) |

---

## 5. 공통 예외 처리 (03-frontend.md "공통 규칙")

| 항목 | 구현 | 상태 |
|---|---|---|
| **오프라인 배너** | `packages/ui` `OfflineBanner`(navigator.onLine + online/offline 이벤트), user/rider App 루트에 고정 마운트 | ✅ (단위테스트 + 브라우저) |
| **네트워크 재시도** | TanStack Query `retry: 1` + `refetchOnReconnect: true`(3앱), 공통 `Toast` 재시도 버튼 | ✅ |
| **에러 표시** | errorCodes → 한글 메시지 맵(`ERROR_MESSAGE_KO`), Edge Function envelope 파싱 | ✅ |
| **빈 상태** | 주요 리스트(이력/콜/알림/원장/큐)에 EmptyState 또는 안내 문구 | ✅ (전 앱 전수 확인) |
| **로딩 스켈레톤** | 시세/잔액 카드·리스트는 스켈레톤(스피너 금지) | ✅ |
| **콜 만료/무수락** | order-expire 자동취소 + user 화면 "자동 취소" 표시, rider 콜 사라짐 | ✅ |

---

## 6. Supabase advisors (보안/성능)

로컬 스택(Supabase CLI 2.109.0, Postgres 17)에 대해 advisor lint를 직접 SQL로 점검·수정했다.
(로컬 CLI에는 hosted `advisors` 서브커맨드가 없어, 동일 lint 규칙을 카탈로그 쿼리로 재현.)

| Lint | 결과 | 조치 |
|---|---|---|
| `security_definer_view` | ✅ 0 (앱 객체) | `v_point_balance`는 `security_invoker=true`(T10) — RLS 위임 정상 |
| `function_search_path_mutable` | ✅ 0 (앱 함수) | `is_admin`·`forbid_ledger_mutation`·`fn_is_assigned_rider_of_caller`에 `search_path=public` 고정 → `20260704000014_function_search_path.sql` |
| `auth_rls_initplan` (성능) | ✅ 0 | 14개 정책의 직접 `auth.uid()`를 `(select auth.uid())`로 감쌈 → `20260704000015_rls_initplan.sql`. RLS 의미 불변(본인 uid) — psql 실측으로 본인 조회 성공/타인 조회 0행 재확인 |
| `rls_disabled_in_public` | ⚠️ PostGIS `spatial_ref_sys` 1건 | **의도적 잔존**: PostGIS 확장 소유 참조 테이블. 앱이 소유하지 않아 수정 대상 아님(Supabase 공식 문서상 무시 가능) |
| `unindexed_foreign_keys` (성능, INFO) | ⚠️ 감사/관리 FK 6건 | **의도적 잔존**: `created_by`/`processed_by`/`actor_id`/`depot_id` 등 저빈도 관리 컬럼. 데이터 볼륨이 생긴 후 실제 쿼리 패턴 기준으로 인덱싱 판단(현 시점 투기적 인덱스 지양). advisor도 INFO 레벨 |

`geography_columns`/`geometry_columns`(PostGIS 시스템 뷰)도 `security_definer_view`로 잡히나
동일하게 확장 소유 객체라 잔존. **앱이 소유한 객체 기준 보안/성능 WARN은 0건.**

> 마이그레이션은 실행 중 로컬 DB에 적용해 재검증했고(양쪽 exit 0), 단일 진실
> `01-db-schema.sql`도 동기화했다(CLAUDE.md 규칙 6).

---

## 7. 이 환경에서 검증 불가 — 런칭 전 실기기/CI 검증 필요 🔴

`04-tasks.md` 질문 목록에 사유가 상세히 기록돼 있다. 요약:

| 항목 | 사유 | 런칭 전 필요 검증 |
|---|---|---|
| **실제 FCM 푸시 수신** | `FCM_SERVICE_ACCOUNT` 자격증명 없음. 서버는 로그만 남기고 스킵(notifications 기록은 항상 수행). 토큰 발급은 네이티브 런타임에서만 | 서비스 계정 키 발급 → secret 등록 → 실기기/디바이스팜 수신 확인 |
| **에뮬레이터/시뮬레이터 실행** | 머신 부하로 부팅 금지(태스크 지시) | Android/iOS 실기기 또는 CI에서 앱 기동 |
| **딥링크 탭 이동** | 네이티브 앱 미기동 | `oilpick-user://orders/:id` 등 실제 라우팅(정규화 로직은 단위테스트 ✅) |
| **카카오맵 실렌더** | `VITE_KAKAO_KEY` 없음(폴백 UI만 렌더) | 실 키 주입 후 지도/마커 육안 확인 |
| **카메라 QR 스캔** | 네이티브 카메라 필요(수동 입력 폴백은 ✅) | 실기기 `@capacitor-community/barcode-scanner` 스캔 |
| **부하 상 일부 E2E** | Docker 리소스 경합(Postgres 다운 이력) | CI에서 안정 리소스로 전체 시나리오 재실행 |
| **실 SMS OTP** | Twilio 등 미연동(test_otp만) | 프로덕션 SMS 프로바이더 연동 후 실 발송 |
| **브랜드 아이콘/스플래시** | 임시 placeholder | 실 로고 교체 후 재생성 |

---

## 8. 자동 테스트 현황

`pnpm test` 전체 통과. (커밋 전 `pnpm lint && pnpm test && pnpm build` 필수)

| 패키지 | 테스트 파일 | 테스트 수 |
|---|---|---|
| @oilpick/core | 5 | 289 |
| @oilpick/ui | 16 | 34 |
| @oilpick/user | 18 | 70 |
| @oilpick/rider | 2 | 10 |
| @oilpick/admin | 5 | 19 |

T13에서 추가: `OfflineBanner`(ui, 6) + admin 회귀 안전망 17개(대시보드 KPI 집계 2 · 주문
필터/라벨/kg 표시 4 · 출금 상태전이 5 · 분쟁 중재/취소 드로어 6).

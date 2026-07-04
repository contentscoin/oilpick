# 04. 작업 지시서 (위에서부터 순서대로. 각 태스크는 독립 커밋)

규칙: 각 태스크 완료 시 `pnpm lint && pnpm test && pnpm build` 통과 후 커밋.
설계 판단이 필요해 보이면 만들지 말고 스펙 문서(00~03)에서 답을 찾을 것. 스펙에 정말 없으면 TODO 주석 + 질문 목록에 기록.

## T1. 모노레포 스캐폴딩
- pnpm workspace + turbo.json, packages/config (tsconfig/eslint/tailwind preset)
- apps 3개 Vite 부트스트랩 (react-ts), packages/core·ui 빈 패키지
- 루트 스크립트: dev:user/dev:rider/dev:admin, lint, test, build
- DoD: 3개 앱 빈 화면 dev 서버 구동, turbo build 통과

## T2. packages/core
- 03-frontend.md의 core 명세 전부: constants, orderMachine(+전이 테이블), schemas(zod),
  format, estimate, errorCodes, supabase 팩토리
- vitest: orderMachine 전이 테이블 전수 테스트, estimate/format 테스트
- DoD: 테스트 통과, 다른 패키지에서 import 가능

## T3. Supabase 스키마
- 01-db-schema.sql을 마이그레이션 파일로 (supabase/migrations/0001_init.sql)
- Storage 버킷 2개 + 정책, Realtime publication, admin 시드 스크립트(supabase/seed.sql:
  admin 계정, 집하장 1개, 초기 price_tick 1건)
- RPC 함수: fn_post_ledger(user, type, amount, order, memo), fn_transition_order(핵심 전이+원장을 단일 트랜잭션으로)
- DoD: `supabase db reset` 클린 통과, 로컬 studio에서 뷰/트리거 동작 확인 SQL 스크립트 첨부

## T4. Edge Functions — 주문 코어
- _shared/push.ts, _shared/auth.ts(uid+role 로더), _shared/response.ts
- order-create, order-accept, order-transition, order-expire (02-api.md 그대로)
- Deno 테스트: 상태머신 위반 409, 동시 수락 시나리오(조건부 update), 멱등 지급
- DoD: supabase functions serve로 로컬 curl 시나리오 통과 (README에 curl 스크립트)

## T5. Edge Functions — 포인트/운영
- withdraw-request, withdraw-process, price-set, point-adjust, rider-verify, rider-location
- 원장 불변식 테스트: 주문 1건 완주 → EARN+HOLD+RELEASE 검증, 잔액 부족 출금 400
- DoD: 테스트 통과

## T6. packages/ui
- 토큰 + Tailwind preset + 03에 명시된 공용 컴포넌트 전부. Storybook 없이 apps/user 내 /dev-ui 라우트(개발 전용)로 육안 확인 페이지
- DoD: dev-ui에서 전 컴포넌트 렌더

## T7. apps/user — 인증/홈/시세
- U1, U2(전화 OTP + 프로필 생성 + 카카오 주소검색), U3 홈, U4 시세
- DoD: 가입→홈에서 실시세·예상 포인트 표시

## T8. apps/user — 주문 플로우
- U5 요청 3스텝, U6/U7/U8/U9 상태별 화면, Realtime 구독, U10 이력
- DoD: (라이더 앱 미완이므로) admin SQL로 상태 전이시켜 화면 전환 확인

## T9. apps/rider — 인증/콜/운행
- R1 서류 제출, R2 콜 홈(온라인 토글), R3 수락, R4~R6 운행(계량+사진+QR 스캔), 위치 업로드
- DoD: 실 시나리오 — user 앱 요청 → rider 앱 수락 → 계량 → user 확인 → QR 배송완료 → 양쪽 포인트 반영 E2E (웹 브라우저 2창으로 가능, QR은 개발 모드에서 수동 입력 fallback 제공)

## T10. apps/user·rider — 지갑/정산/마이
- U11/U12, R7/R8/R9, 알림함 공통, 마이/설정
- DoD: 출금 신청→(admin SQL 승인)→원장 반영 확인

## T11. apps/admin 전체
- 03-frontend.md admin 표 전부. 시드 admin 계정 로그인
- DoD: 대시보드 실시간 지도에 진행 주문 표시, rider 승인·출금 처리·분쟁 중재를 UI로 수행하는 E2E

## T12. 푸시 & Capacitor 패키징
- FCM 연동(양 앱), 알림 매트릭스(00-domain.md) 전 이벤트 발송 확인
- Capacitor add android/ios, 아이콘/스플래시(assets/ 임시 로고), 딥링크, 권한 온보딩
- DoD: Android 에뮬레이터 + iOS 시뮬레이터에서 푸시 수신·딥링크 이동

## T13. 마감
- 예외 처리 점검: 오프라인 배너, 콜 만료, 재시도, 빈 상태 화면 전수
- Supabase advisors 보안/성능 경고 0건 (또는 사유 문서화)
- README.md: 로컬 셋업, 환경변수, 배포 절차
- DoD: docs/spec/qa-checklist.md 작성 + 자체 점검 결과 기록

## 질문 목록
스펙으로 해결 안 되는 사항은 여기 추가하고 임의 결정하지 말 것:
- (T4) FCM 서비스 계정 자격증명(`FCM_SERVICE_ACCOUNT` secret)이 이 개발 환경에 없다.
  `_shared/push.ts`는 시크릿 누락/발송 실패를 catch해서 로그만 남기고 핵심 로직(상태 전이,
  포인트 지급)은 절대 막지 않도록 구현했다 — notifications 테이블 기록은 FCM 발송 성패와
  무관하게 항상 수행된다. 이는 실제 FCM 연동(서비스 계정 키 발급 및 Supabase secrets 등록)
  전까지 유효한 임시 동작이며, 연동 시점에 `FCM_SERVICE_ACCOUNT`만 설정하면 자동으로 실제
  발송이 활성화된다(코드 변경 불필요).
- (T4) 01-db-schema.sql/20260704000001_init.sql~20260704000003_rpc.sql에는 명시돼 있지 않지만,
  로컬 Supabase 스택(CLI 2.109.0)에서 `db reset`/`start` 시 `alter default privileges in schema
  public grant all on tables to postgres, anon, authenticated, service_role` 이후
  `revoke select, insert, update, delete on tables from anon, authenticated, service_role`이
  자동 실행되어, 이후 마이그레이션으로 생성되는 모든 public 테이블에 anon/authenticated/
  service_role의 select/insert/update/delete 권한이 전혀 없는 상태가 된다(`revoke all on
  function ... from public`도 동일하게 service_role의 EXECUTE 권한까지 제거함). RLS 정책과는
  별개로 이 기본 GRANT 자체가 없으면 service_role(Edge Function)도 "permission denied"로
  막힌다 — T4 curl 검증 중 실제로 `profiles` SELECT와 `fn_find_eligible_riders` EXECUTE가
  이 문제로 실패하는 것을 확인했다. `supabase/migrations/20260704000005_grants.sql`을 추가해
  service_role에 테이블 CRUD 전체 + RPC 4종 EXECUTE를, authenticated/anon에는 RLS 정책이
  이미 정의된 만큼의 select/insert/update를 명시적으로 GRANT했다. 향후 새 테이블/함수를
  추가할 때도 이 패턴(명시적 GRANT)을 함께 챙겨야 한다 — 04-tasks.md 이후 태스크(T5 이상)
  진행 시 동일 문제가 재발할 수 있으니 신규 테이블/RPC마다 확인 필요.
- (T4) Edge Function(Deno)은 `packages/core/src`의 확장자 없는 상대 import(예: `./constants`,
  tsconfig `moduleResolution: "Bundler"` 관례)를 해석하지 못한다(직접 검증: Deno import map의
  `scopes`로도 우회 불가, `--unstable-sloppy-imports`는 CLI `deno check`에서는 동작하나
  `supabase-edge-runtime`(edge-runtime 1.74.2) 바이너리는 인식하지 않음 — 실제 함수 호출 시
  "Module not found" 부팅 에러로 재현됨). packages/core 원본은 수정 최소화 원칙에 따라 건드리지
  않고, `supabase/functions/_shared/vendor/build.sh`(esbuild 기반)로 각 소스 파일을 자기완결형
  ESM으로 번들링해 `supabase/functions/_shared/vendor/oilpick-core/`에 vendoring하는 방식으로
  해결했다. packages/core/src가 바뀔 때마다 이 스크립트를 재실행해 vendor 산출물을 갱신해야
  한다(자동화는 이 태스크 범위 밖 — CI/pre-commit 훅으로 추후 자동화 검토 필요).
- (T4, 재시도 2 수정) 00-domain.md:30은 REQUESTED→CANCELLED 트리거를 "supplier 또는 시스템"으로
  명시하지만, 20260704000003_rpc.sql의 fn_transition_order CANCEL 분기는 애초에 시스템(30분
  무수락 자동취소) 경로를 구현하지 않았다 — user_role enum(01-db-schema.sql:7)에 'system' 값이
  없기 때문. 1차 구현에서는 order-expire Edge Function이 이 공백을 pickup_orders.status 직접
  UPDATE로 우회해 CLAUDE.md 절대 규칙 2("상태 전이는 Edge Function order-transition/RPC로만")를
  구조적으로 위반했다(logic-review 지적). 스펙에 없는 새 설계 판단이 필요한 지점이라 임의 결정
  대신 다음으로 해결: user_role enum에 'system'을 추가하지 않고(profiles.role 등 실사용자 role과
  섞이면 안전하지 않음 — 시스템은 로그인 계정이 아니라 profiles에 대응 row가 없음),
  `p_actor_id IS NULL AND p_actor_role IS NULL` 조합을 시스템 액터의 명시적 신호로 규약화했다
  (order_events.actor_id 컬럼 주석 "null = 시스템", 01-db-schema.sql:106과 정합).
  20260704000006_rpc_system_cancel.sql에서 fn_transition_order를 CREATE OR REPLACE로 갱신했고,
  order-expire의 cancelNoRider는 이제 이 RPC를 호출한다(직접 UPDATE 제거). 함수 시그니처는
  그대로(user_role 파라미터는 nullable로 SQL NULL 전달 가능)라 20260704000005_grants.sql의
  EXECUTE GRANT 재적용은 불필요. 사람 actor가 이 경로를 오용할 수 없는 이유: Edge Function은
  항상 _shared/auth.ts에서 profiles 재조회한 role을 넘기므로 사람 호출에서 actor_role=NULL이
  나올 수 없다(클라이언트가 role을 자칭해도 무시됨 — CLAUDE.md 절대 규칙 3).
- (T5) 02-api.md "withdraw-request"는 "RPC 트랜잭션: v_point_balance.available >= amount 검증
  (행 잠금은 원장 insert 직렬화로) → WITHDRAW_REQUEST(-amount) → withdrawals insert"라고 명시하지만
  기존 RPC(fn_post_ledger/fn_transition_order)에는 "잔액 확인 + 차감을 원자적으로 묶는" 함수가
  없었다 — v_point_balance는 point_ledger 위 집계 뷰라 "확인 후 잠글 행"이 존재하지 않는다. 태스크
  지시사항대로 이는 새 설계가 아니라 00-domain.md "포인트 원장 규칙"(잔액 부족 400, 최소 출금
  10,000P)을 만족시키기 위한 구현 세부라서, `20260704000007_rpc_withdraw_request.sql`에
  `fn_request_withdraw(user_id, amount, bank_name, bank_account, bank_holder)`를 추가했다.
  구현: 동일 user_id의 point_ledger 행을 `for update`로 잠가(사실상 user 단위 직렬화) 잔액을
  재계산 → 부족하면 INSUFFICIENT_BALANCE 예외 → withdrawals insert → fn_post_ledger로
  WITHDRAW_REQUEST(-amount) 기록까지 단일 트랜잭션(단일 RPC 호출)으로 처리. 동시에 같은 잔액을
  넘는 두 출금 요청이 들어와도 하나만 성공하도록 실제 동시 curl 2건으로 검증했다(레이스 테스트
  결과: 60000 잔액에 40000 동시 요청 2건 → 정확히 1건 200, 1건 400 INSUFFICIENT_BALANCE, 최종
  잔액 20000로 음수 없음 확인). 같은 이유로 withdraw-process(admin)도
  `20260704000008_rpc_withdraw_process.sql`의 `fn_process_withdraw`로 상태 전이
  (REQUESTED→APPROVED→PAID, REQUESTED→REJECTED+WITHDRAW_CANCEL 복구)를 단일 RPC 트랜잭션에서
  처리하도록 구현했다(fn_transition_order와 동일 패턴 — 02-api.md 공통 규칙 "상태 전이+원장
  기록은 단일 Postgres 함수 호출로 트랜잭션 보장"). 두 RPC 모두 service_role에만 EXECUTE를
  부여했다(CLAUDE.md 절대 규칙 1).
- (T5) rider-location: "진행중 주문이 있을 때만 last_location 갱신 허용"이 태스크 지시사항에
  명시돼 있었으나 02-api.md 자체에는 "허용하지 않을 때의 처리"가 적혀 있지 않다. 임의 설계
  판단 대신 가장 보수적인 해석(진행중 주문이 없으면 400 VALIDATION_ERROR로 거부, 위치를 저장하지
  않음)을 택했다 — 운행과 무관한 위치 갱신은 스펙 범위 밖이고, 라이더 위치 추적을 운행 중으로
  한정하는 것이 00-domain.md의 취지(공급자 지도용 실시간 위치)에 부합한다고 판단했다.

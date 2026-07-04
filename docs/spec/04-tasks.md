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
- (T6) MapView: 이 개발 환경에는 실제 카카오맵 JS SDK API 키가 없다. `apiKey`를 prop으로
  주입받게 하고(앱은 `import.meta.env.VITE_KAKAO_KEY`를 읽어 넘기면 됨), 키가 없거나
  `https://dapi.kakao.com/v2/maps/sdk.js` 스크립트 로드가 실패하면 크래시 없이 자리표시자
  UI(`data-testid="map-view-placeholder"`)를 렌더하도록 구현했다. 실제 키가 주입되고 SDK 로드가
  성공하면 컨테이너 div에 `kakao.maps.Map`/`Marker` 인스턴스를 마운트한다(`packages/ui/src/components/MapView.tsx`).
  실제 키로 지도가 정상 렌더되는지는 이 환경에서 검증 불가 — 실 키 주입 후 사람이 육안 확인 필요.
- (T6) PhotoUploader: 최종 형태는 Capacitor Camera 플러그인이지만 Capacitor는 T12에서 추가된다.
  지금은 표준 웹 `<input type="file" accept="image/*" capture="environment">`로 구현했고,
  공개 API를 `photos: PhotoAsset[]`(`{ url, file }`) + `onChange(photos)` 콜백으로 고정했다
  (`packages/ui/src/components/PhotoUploader.tsx`). T12에서 @capacitor/camera로 내부 구현만
  교체하면 되도록 설계했다 — `url`은 표시용(webPath/dataUrl/objectURL 어느 쪽이든 `<img src>`로만
  소비), `file`은 Storage 업로드용 File/Blob이라는 계약만 유지하면 소비 측(R4 계량 제출 등) 코드는
  변경이 필요 없다.
- (T7) 전화 OTP: 이 개발 환경에는 실제 SMS 프로바이더(Twilio 등)가 연결돼 있지 않다. GoTrue의
  공식 로컬 테스트 기능인 `supabase/config.toml`의 `[auth.sms.test_otp]`로 해결했다 — 실제로
  로컬 스택에서 직접 검증한 결과 두 가지가 확인됐다: (1) `[auth.sms]`에 실제 프로바이더가 하나도
  `enabled=true`가 아니면 GoTrue가 "no SMS provider is enabled"로 판단해 전화 로그인 자체를
  비활성화한다(`test_otp`만 설정해도 무시됨) — 그래서 `[auth.sms.twilio]`를 더미 자격증명으로
  `enabled=true`로 켜 두었다(`test_otp`에 등록된 번호는 실제 Twilio 호출 전에 GoTrue가 가로채
  고정 코드로 검증하므로 이 더미 자격증명으로 실제 SMS가 나가는 일은 없다 — 미등록 번호로 시도하면
  이 더미 자격증명으로 Twilio 호출을 시도해 실패한다). (2) `test_otp`의 phone 키와
  `signInWithOtp`에 넘기는 phone 값은 GoTrue가 요구하는 E.164(국가코드, '+' 없음) 형식이어야
  한다 — "01000000000" 같은 국내 표기는 "Invalid phone number format" 400으로 거부되고
  "821000000000"(82+국내번호 앞자리 0 제거) 형식만 통과한다. 이에 따라
  `packages/core/src/phone.ts`에 `toE164Kr` 변환 헬퍼를 추가해 U2 화면이 사용자 입력(국내 표기)을
  Auth 호출 시점에만 E.164로 변환하도록 구현했다(profiles.phone에는 국내 표기 원본 저장).
  `enable_signup=true`로 설정해 회원가입 흐름도 허용했다. 테스트 번호:
  `010-0000-0000`/`010-0000-0001` → 고정 코드 `123456`.
- (T7) 카카오 주소검색: 이 개발 환경에는 카카오 주소검색(Daum Postcode) API 키가 없다(T6 MapView와
  동일한 공백). `apps/user/src/components/AddressField.tsx`를 만들어 `VITE_KAKAO_KEY`가 없으면
  수동 텍스트 주소 입력 필드로 폴백하고, 위/경도는 기본값(집하장 인근 좌표, 서울 강서구
  37.5509/126.8225)을 유지한 채 "위/경도 직접 입력(선택)" 토글로 사용자가 필요 시 직접 숫자를
  조정할 수 있게 했다. 실제 키가 주입되면(hasKakaoKey 분기가 true) 카카오 주소검색 SDK 연동으로
  교체해야 하는데 그 호출부는 아직 없다 — 현재는 폴백 UI만 항상 렌더된다(개발 환경에서
  VITE_KAKAO_KEY가 항상 비어 있어 이 분기는 실행되지 않음).
- (T7) price_ticks Realtime publication 누락: 01-db-schema.sql/20260704000002_storage_realtime.sql은
  "Realtime publication: pickup_orders, notifications 활성화"만 구현했으나, 03-frontend.md
  U3(55~61행)은 "PriceCard(최신 tick, Realtime 구독)"을 명시적으로 요구한다. 이는 새로운 설계
  판단이 아니라 스펙이 이미 요구한 기능을 위한 스키마 보완이라 판단해
  `20260704000009_realtime_price_ticks.sql`로 price_ticks를 supabase_realtime publication에
  추가하고 01-db-schema.sql 주석도 동기화했다(CLAUDE.md 규칙 6).
- (T7, 실사용 버그 수정) Realtime 구독 훅 2개에서 렌더 크래시를 발견해 수정했다: (1) `usePriceTicks`가
  고정 채널명(`"price_ticks_changes"`)을 썼는데, HomePage가 `useLatestPriceTick()`(내부적으로
  `usePriceTicks(30)`)과 `usePriceTicks(10)`을 동시에 호출하면서 동일 채널명으로 Supabase Realtime
  채널을 중복 구독해 충돌 — 실제로 브라우저에서 홈 화면이 완전히 빈 화면(root DOM 비어있음)으로
  렌더되는 것으로 재현됨. 채널명을 `` `price_ticks_changes_${limit}` ``로 limit별 고유화해 해결.
  (2) `useActiveOrder`의 `useEffect` 의존성 배열에 `queryKeys.activeOrder(userId)`가 반환하는
  배열(매 렌더 새 참조)을 그대로 넣어 매 렌더마다 채널을 구독/해제 — 의존성을 `[userId, queryClient]`
  로 바꾸고 이펙트 내부에서 최신 queryKey를 다시 계산하도록 고쳤다. 두 버그 모두 자동 테스트
  (vitest, jsdom 환경의 목 채널)로는 잡히지 않고 실제 브라우저 렌더에서만 재현됐다 — 이 태스크
  지시사항의 "가능하면 브라우저 자동화로 직접 실행해 확인" 요구가 아니었다면 놓쳤을 결함이다.
- (T8) 라이더 카드 read 권한 공백: 03-frontend.md U6~U9(63행)는 "/orders/:id"에서 "라이더
  카드(이름/차량/인증배지/전화 tel:)"를 요구하지만, 01-db-schema.sql의 기존 RLS(p_profiles_self,
  p_rider_self)는 profiles/rider_profiles를 "본인 또는 admin"만 select하도록 허용해 supplier가
  자신에게 배정된 라이더 정보를 조회할 방법이 없었다. 이는 새로운 설계 판단이 아니라 스펙이 이미
  요구한 화면을 위한 스키마 보완이라 판단해, p_order_rider/p_events_read와 동일한 "본인이 관련된
  주문의 상대방 정보 read" 패턴을 profiles/rider_profiles에 대칭 적용하는
  `20260704000010_rider_card_read_policy.sql`을 추가했다(01-db-schema.sql도 동기화).
- (T8, 실사용 버그 수정) 위 RLS 정책의 최초 버전은 profiles/rider_profiles 정책 안에서 직접
  `exists(select 1 from pickup_orders ...)`를 썼는데, 이 때문에 로컬 브라우저 검증 중
  `GET .../profiles`, `GET .../pickup_orders` 요청이 전부 500으로 실패하는 것을 실제로 확인했다
  (postgres 로그: "infinite recursion detected in policy for relation pickup_orders"). 원인:
  pickup_orders의 기존 정책 p_order_open_calls가 rider_profiles를 참조하는데(RLS 콜 목록용),
  내가 추가한 rider_profiles 정책이 다시 pickup_orders를 참조해 순환이 생김. is_admin()과 동일한
  패턴으로 `fn_is_assigned_rider_of_caller(uuid)` security definer 함수로 pickup_orders 조회를
  감싸 RLS 재평가를 우회하도록 고쳐 해결했다 — 이 버그는 정적 타입체크/lint/vitest로는 전혀
  드러나지 않고 실제 로컬 Supabase 스택 + 브라우저 렌더에서만 재현됐다.
- (T8, 실사용 버그 아님 — 검증 중 발견한 psql 함정) `fn_transition_order` 같은 컴포짓(row) 반환
  RPC를 `psql`에서 `select (fn_transition_order(...)).*`(괄호+`.*` 전개) 형태로 호출하면, 알 수 없는
  이유로 동일 statement 내에서 함수가 두 번 평가되는 것처럼 동작해(첫 호출은 성공하지만 두 번째
  평가가 이미 전이된 행에 대해 실패) 항상 `ALREADY_ACCEPTED`류 에러로 보이는 현상을 로컬에서
  실제로 겪었다(`DO` 블록으로 동일 호출을 감싸거나 `select fn_transition_order(...)`로 `.*` 전개 없이
  호출하면 정상 동작 확인). 관리자/운영자가 이 RPC를 psql로 직접 검증할 때는 `.*` 전개 없이
  `select fn_transition_order(p_order_id, p_action, p_actor_id, p_actor_role, p_payload);` 형태로
  호출할 것 — 이 각주는 향후 admin SQL 콘솔/런북에 반영이 필요하다.
- (T9) rider_profiles Realtime publication 누락: 03-frontend.md apps/rider R1은 "PENDING 대기
  화면(Realtime으로 rider_profiles.verify_status 변경 감지해 자동 전환)"을 명시적으로 요구하지만,
  01-db-schema.sql/기존 마이그레이션은 pickup_orders·notifications(T3)·price_ticks(T7)만
  supabase_realtime publication에 추가했고 rider_profiles는 빠져 있었다. T7의 price_ticks
  누락과 동일한 종류(스펙이 이미 요구한 기능을 위한 스키마 보완, 새 설계 판단 아님)라 판단해
  `20260704000011_realtime_rider_profiles.sql`로 추가했다(01-db-schema.sql 주석 동기화).
  실제 브라우저 E2E 중 admin이 SQL로 verify_status를 APPROVED로 바꿔도 /verify 화면이
  자동 전환되지 않는 것을 먼저 재현한 뒤 원인을 특정했다 — 이 마이그레이션 적용 후 재검증해서
  자동 전환(콜 홈으로 즉시 이동)을 확인했다.
- (T9) QR 스캐너 폴백: 위 태스크 지시사항이 이미 "depotId+qrSecret 수동 텍스트 입력(또는 두 개
  select/입력 필드) 폴백 UI로 구현하고 질문 목록에 기록"하라고 명시했으므로 그대로
  `apps/rider/src/pages/ActiveRunPage.tsx`의 PickedUpPanel에 두 개 텍스트 입력 필드로
  구현했다(@capacitor-community/barcode-scanner 도입은 T12). 실제 잘못된 qrSecret 입력 시
  `INVALID_QR` 400이 "QR 코드가 일치하지 않아요" 토스트로 올바르게 표시되는지, 올바른
  depots.qr_secret 입력 시 DELIVER→COMPLETED까지 이어지는지 둘 다 실제 브라우저로 검증했다.
- (T9) order-photos 비공개 버킷과 photo_urls 표시: order-photos Storage 버킷은
  `public: false`(20260704000002_storage_realtime.sql)로 생성돼 있어 `getPublicUrl()`이
  반환하는 URL은 인증 헤더 없는 `<img src>`로는 열람할 수 없다(RLS로 막힘). 새로운 설계 판단이
  아니라 "Storage에 업로드하고 photo_urls에 URL을 저장해 소비 측이 <img src>로 그대로 쓴다"는
  기존 계약(apps/user OrderDetailPage.photoUrls, submitMeasurePayloadSchema의
  `photoUrls: z.array(z.string().url())`)을 실제로 동작하게 만드는 구현 세부라서,
  `ActiveRunPage.tsx`의 계량 사진 업로드는 `upload()` 직후 `createSignedUrl()`(1년 만료)로 만든
  서명 URL을 photoUrls에 담아 SUBMIT_MEASURE에 전달하도록 구현했다. 실제 브라우저 E2E에서
  user 앱 계량 확인 화면에 사진이 정상 로드되는 것으로 검증했다.

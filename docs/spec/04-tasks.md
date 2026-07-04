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
- (비어 있음)

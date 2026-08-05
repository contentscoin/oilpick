# 폐유(payou) — 구현 규칙 (코딩 에이전트 필독)

폐식용유 수거 매칭 플랫폼. 브랜드는 **폐유(한글)/payou(영문)** — 유저 노출 텍스트에 이 표기만 쓴다.
기술 식별자(@oilpick/* 패키지·kr.oilpick.* appId·oilpick-user:// 스킴·스토리지 키 등)는 코드명
OilPick을 유지한다(`docs/spec/10-brand.md` B4가 단일 진실). 모든 설계 결정은 `docs/spec/`에 확정되어 있다.
**스펙에 없는 설계 판단을 새로 하지 말 것.** 모호하면 스펙 문서를 먼저 찾아라.

## 문서 맵
- `docs/spec/00-domain.md` — 도메인 규칙, 용어, 상태머신, 포인트 원장 규칙 (모든 작업 전 필독)
- `docs/spec/01-db-schema.sql` — DB 전체 스키마 + RLS (이 파일이 단일 진실)
- `docs/spec/02-api.md` — Edge Functions 명세 (엔드포인트/입출력/에러코드)
- `docs/spec/03-frontend.md` — 모노레포 구조, 라우팅, 화면별 스펙, 디자인 토큰
- `docs/spec/04-tasks.md` — 작업 순서와 완료 기준 (위에서부터 순서대로 진행)
- `docs/spec/07-pivot-plan.md` — 수거쿠폰 피벗(2차 고도화 F-태스크). **08이 쿠폰 모델을 폐기 — 이력 참조용**
- `docs/spec/08-payout-pivot.md` — 현장 지급수단 피벗(3차 고도화 G-태스크). 쿠폰 폐기·포인트 복권(현금/포인트 지급, 출금 부활)·상태머신 부수효과 재정의의 단일 진실
- `docs/spec/09-referral.md` — 라이더 추천(레퍼럴) 시스템(4차 고도화 H-태스크). 추천코드·딥링크·점주 보너스·라이더 실적/통계의 단일 진실(08 위에 순수 추가)
- `docs/spec/10-brand.md` — 브랜드(폐유/payou, 이력 오반장/OBJ) 표기·로고·적용 범위의 단일 진실
- `docs/spec/11-map-renderer.md` — 지도 렌더러(5차 고도화). **결정: MapLibre(mapcn 패턴) 교체 확정(CEO)** — 타일 env 게이트·VWorld 권장·프리뷰 폴백 유지. 내비 로드맵(M9-a 딥링크 핸드오프 완료·M9-b 인앱 트래킹 후속)의 단일 진실
- `docs/spec/12-stabilization.md` — 3앱 기능 점검 결과 + 안정화 수정 계획(S-태스크). P1: PostGIS 좌표 파싱 죽은 분기 3곳·AddressField 미구현 분기. 계층 0(프로덕션 컷오버/초기 데이터)이 전면 증상 1순위 — **코딩 착수 전 필독**
- `docs/spec/13-org-dealer.md` — 조직 계층 어드민–좌상(dealer, 서브어드민)–라이더(I-태스크). role 'dealer'·rider_profiles.dealer_id·RLS 조회 전용·admin 메뉴 분기의 단일 진실. **D5(정산 로직 없음)는 14가 대체**
- `docs/spec/15-motion-design.md` — 모션 디자인 고도화(6차, beUI 목업 반영 K-태스크). 모션 컴포넌트(OtpInput·DynamicIsland·NumberFlow·SwipeableRow·HeroCard·CheckList)·모션 토큰·**UI 액센트 확장(라임/시안 — 다크 배경 전용)**의 단일 진실. 정보구조·상태머신 불변
- `docs/spec/14-fresh-oil-settlement.md` — 신유(새 식용유) 구매·현장 혼합정산·좌상 정산 체인(J-태스크). 13 D5를 supersede. 신유 고시가 tick(18L 1종)·주문 order_kind(수거/구매/혼합)·현장 상계(폐유 수령액↔신유 대금, 차액 현금/포인트)·TRADE_PURCHASE 원장·좌상 보증금 크레딧 한도·정산 청구 라이프사이클(수수료율 초기 0%)·수거 추적(arrived_at·pickup_items 바코드·라이더 실시간 위치)의 단일 진실
- `docs/spec/16-ops-convenience.md` — 라이더·좌상 운영편의성 고도화(7차, L-태스크). 알림 계층 단일화(notifications.kind·dedupe 헬퍼)·라이더 인앱 경로 ETA/계량 드래프트/방문 순서·확인 교착 리마인드(상태 무접촉)·좌상 관제 뷰(v_dealer_active_orders, 14 §2-5 예약 실행)·정산 셀프서비스·정산 워치의 단일 진실. 정보구조·상태머신·원장 불변(08/09/13/14 위 순수 추가)

## 스택 (변경 금지)
- pnpm workspace + Turborepo. Node 18 LTS (환경 확인됨: v18.19.1, pnpm 10.14.0), TypeScript strict.
- 앱: Vite + React 18 + TypeScript + Capacitor 6 (apps/user, apps/rider)
- 관리자: Vite + React + shadcn/ui + Tailwind (apps/admin)
- 상태: TanStack Query v5 (서버 상태) + Zustand (로컬 상태). Redux 금지.
- 라우팅: react-router v6.
- 백엔드: Supabase (Postgres + PostGIS + Realtime + Edge Functions Deno + Storage)
- 폼: react-hook-form + zod. 모든 API 입출력은 zod 스키마로 검증.
- 지도: MapLibre GL(packages/ui MapView — 타일은 `VITE_MAP_STYLE_URL` env 주입, 미설정 시 프리뷰 폴백.
  11-map-renderer.md가 단일 진실). 주소검색: 카카오(user 앱 `VITE_KAKAO_KEY`). 길찾기: 카카오맵/TMap
  앱 딥링크 핸드오프. 푸시: FCM (Capacitor push-notifications 플러그인).

## 절대 규칙
1. **포인트·쿠폰 원장은 클라이언트에서 절대 쓰지 않는다.** point_ledger·coupon_ledger에 insert하는
   코드는 Edge Function/service_role RPC에만 존재한다. 잔액은 뷰(v_point_balance·v_coupon_balance)로만 조회.
2. **주문 상태 전이는 Edge Function `order-transition`으로만.** 클라이언트가
   pickup_orders.status를 직접 update하는 코드를 쓰면 안 된다.
3. 모든 테이블에 RLS 필수. service_role 키·PG(토스페이먼츠) 시크릿 키는 Edge Function에서만 사용, 클라이언트 번들에 금지.
4. 금액/포인트는 정수(원, P). 소수점 금지. 무게는 kg 소수 1자리 (numeric(8,1)).
5. 시세·수거비는 주문 생성 시점 스냅샷을 pickup_orders에 저장. 이후 시세 변동 무영향.
6. DB 마이그레이션은 supabase/migrations/에 순번 파일로. 스키마 변경 시 01-db-schema.sql도 동기화.
7. UI 텍스트는 한국어. packages/core의 상수/타입을 공유하고 앱별 중복 정의 금지.
8. 테스트: 포인트 원장, 상태머신, 매칭 로직은 단위 테스트 필수 (vitest). UI 테스트는 선택.
9. UI 레이아웃은 글자 확대(텍스트 줌 1.3~2배)에 강건해야 한다 — `docs/spec/03-frontend.md`
   '레이아웃 강건성' 절 준수: 텍스트 컨테이너 고정 height/width 금지(minHeight/minWidth+padding),
   nowrap은 ellipsis+overflow hidden+minWidth:0 3종 세트로만, 정보 행 flexWrap 기본,
   페이지 가로 스크롤 금지.

## 명령
- `pnpm dev:user` / `dev:rider` / `dev:admin` — 개발 서버
- `pnpm test` / `pnpm lint` / `pnpm build` — 커밋 전 3개 모두 통과 필수
- `supabase start` — 로컬 스택, `supabase db reset` — 마이그레이션 재적용
- `supabase test db` — pgTAP(정식). Docker를 못 쓰면 `bash scripts/pgtap-local/run.sh`
  (임시 PG 클러스터 + Supabase shim으로 마이그레이션 전량 적용 후 전 스위트 실행 — 14 §10-4)

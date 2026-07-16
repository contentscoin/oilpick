# OilPick

폐식용유(廢食用油) 수거 매칭 플랫폼. 음식점(공급자)이 폐식용유 수거를 요청하면(18L/10L 통 수
또는 kg 직접 입력) 인근 라이더가 콜을 수락해 현장에서 계량 후 스냅샷 시세에 맞춰 **현금 또는
포인트로 현장 지급**하고 기름을 매입한다(수거한 기름은 허가 재활용업체에 인계). 포인트로 받은
점주는 별도로 **출금 신청**할 수 있다(08 현장 지급수단 피벗 — 07 수거쿠폰 모델은 폐기·레거시 보존).
라이더는 **추천코드/링크로 점주를 유입**시키고, 추천 점주의 첫 수거 완료 시 점주 보너스 적립과
라이더 추천 실적이 집계된다(09 레퍼럴).

- **공급자 앱**(apps/user), **라이더 앱**(apps/rider): Vite + React 18 + TypeScript + Capacitor 6
- **관리자 웹**(apps/admin): Vite + React + shadcn/ui + Tailwind
- **백엔드**: Supabase (Postgres + PostGIS + Realtime + Edge Functions + Storage)

> 모든 설계 결정은 `docs/spec/`에 확정되어 있다. 스펙에 없는 설계 판단을 새로 하지 말 것.
> - `docs/spec/00-domain.md` — 도메인 규칙, 상태머신, 포인트 원장 규칙(현역 — 08 복권), 라이더 추천 규칙
> - `docs/spec/01-db-schema.sql` — DB 전체 스키마 + RLS (단일 진실)
> - `docs/spec/02-api.md` — Edge Functions 명세
> - `docs/spec/03-frontend.md` — 모노레포 구조, 라우팅, 화면 스펙, 디자인 토큰
> - `docs/spec/04-tasks.md` — 작업 순서와 완료 기준, 그리고 "질문 목록"(환경 제약/미검증 항목)
> - `docs/spec/qa-checklist.md` — 역할×플로우×예외 QA 매트릭스 + 자체 점검 결과
> - `docs/spec/07-pivot-plan.md` — 수거쿠폰 피벗(2차) — **08이 쿠폰 모델 폐기, 이력 참조용**
> - `docs/spec/08-payout-pivot.md` — 현장 지급수단 피벗(3차)의 단일 진실 — 쿠폰 폐기·포인트 복권·출금 부활
> - `docs/spec/09-referral.md` — 라이더 추천(레퍼럴) 시스템(4차)의 단일 진실 — 코드·딥링크·보너스·실적
> - `DEPLOY.md` — 프로덕션 배포(Supabase+Vercel). Supabase 단계는 `scripts/deploy-cutover.sh` 원샷

---

## 모노레포 구조

```
oilpick/
├── apps/
│   ├── user/    # 공급자(supplier) 앱   — Capacitor id: kr.oilpick.user
│   ├── rider/   # 라이더(rider) 앱      — Capacitor id: kr.oilpick.rider
│   └── admin/   # 관리자 웹 (SPA, shadcn/ui + TanStack Table)
├── packages/
│   ├── core/    # 타입, zod 스키마, orderMachine(상태머신), errorCodes, 상수,
│   │            # supabase 클라이언트 팩토리, 포맷터, estimate — 모든 앱의 기반
│   ├── ui/      # 디자인 토큰 + user/rider 공용 컴포넌트 (admin은 shadcn 독립)
│   └── config/  # 공유 tsconfig / eslint / tailwind preset
├── supabase/
│   ├── migrations/   # 순번 마이그레이션 (20260704000001_init.sql ~)
│   ├── functions/    # Edge Functions (Deno) + _shared/
│   ├── config.toml   # 로컬 스택 설정 (auth/sms test_otp 포함)
│   └── seed.sql      # admin·데모 계정, 초기 시세 tick, 열린 콜 1건(로컬 전용 — 쿠폰 시드는 08에서 제거)
├── docs/spec/        # 스펙 문서 (위 참조)
├── package.json      # pnpm workspace 루트
└── turbo.json        # Turborepo 파이프라인
```

빌드 도구: **pnpm workspace + Turborepo**. 패키지 간 의존은 `workspace:*`로 연결된다.

---

## 사전 요구사항

| 도구 | 버전(검증됨) | 비고 |
|---|---|---|
| Node.js | 18 LTS (v18.19.1) | `.nvmrc`/engines: `>=18` |
| pnpm | 10.14.0 | `packageManager` 필드로 고정 |
| Docker | 29.x | 로컬 Supabase 스택 실행에 필요 |
| Supabase CLI | 2.109.0+ | 로컬 스택/마이그레이션 |
| Xcode / Android Studio | (선택) | Capacitor 네이티브 빌드 시 |

---

## 로컬 셋업

### 1) 의존성 설치

```bash
pnpm install
```

### 2) 로컬 Supabase 스택 기동

```bash
supabase start
# Docker 리소스 부족으로 헬스체크가 느리거나 실패하면:
supabase start --ignore-health-check
```

기동 후 `supabase status`로 로컬 URL/키를 확인한다. 마이그레이션과 시드를 (재)적용하려면:

```bash
supabase db reset      # migrations/ 전체 재적용 + seed.sql 실행
```

> `db reset`이 리소스 문제로 느리거나 실패하면 재시도 전 30~60초 대기. 이미 스택이 떠 있고
> 새 마이그레이션만 적용하려면 개별 SQL을 psql로 적용해도 된다:
> `docker exec -i supabase_db_oilpick psql -U postgres -d postgres < supabase/migrations/<file>.sql`

### 3) 환경변수 (.env)

각 앱은 `.env.example`을 제공한다. `.env.development`(로컬)와 `.env.production`(배포)로
복사해 값을 채운다(둘 다 `.gitignore` 대상).

| 변수 | 설명 | 로컬 값 출처 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase API URL | `supabase status` → `API_URL` (예: `http://127.0.0.1:54321`) |
| `VITE_SUPABASE_ANON_KEY` | anon 공개 키 | `supabase status` → `ANON_KEY` |
| `VITE_KAKAO_KEY` | 카카오맵 JS SDK / 주소검색 키 | 발급 필요(현재 개발 환경엔 없음) |

> **KAKAO_KEY가 비어 있을 때의 폴백**: `MapView`는 자리표시자 UI를, 주소 입력 화면은 수동
> 텍스트 입력 폴백을 렌더한다(크래시 없음). 실제 지도는 키 주입 후 실기기/브라우저 육안 확인 필요.
>
> **service_role 키는 클라이언트 `.env`에 절대 넣지 않는다.** Edge Function에서만 사용한다
> (CLAUDE.md 절대 규칙 3).

### 테스트 로그인 자격증명 (로컬)

| 대상 | 값 | 설명 |
|---|---|---|
| 공급자/라이더 OTP 전화번호 | `010-0000-0000`, `010-0000-0001` | `config.toml`의 `[auth.sms.test_otp]` |
| OTP 고정 코드 | `123456` | 실제 SMS 미발송, GoTrue가 가로채 검증 |
| 관리자 로그인 | `admin@oilpick.local` / `oilpick-admin-seed` | `seed.sql`로 시드된 admin 계정 |

> 전화 OTP는 GoTrue의 `test_otp` 기능으로 로컬 검증한다. 앱은 국내 표기(`010-…`)를 입력받아
> Auth 호출 시점에만 E.164(`821000000000`)로 변환한다(`packages/core/src/phone.ts`).
> 실 SMS 프로바이더(Twilio 등)는 미연동 — 프로덕션 전환 시 `config.toml`의 `[auth.sms]` 교체.

---

## 개발 서버 실행

```bash
pnpm dev:user     # 공급자 앱
pnpm dev:rider    # 라이더 앱
pnpm dev:admin    # 관리자 웹
```

각 앱은 개별 포트로 뜬다(user/rider/admin). `apps/user/#/dev-ui`는 packages/ui 컴포넌트
육안 확인용 개발 전용 라우트다.

---

## 테스트 · 린트 · 빌드

```bash
pnpm test    # 전 패키지 vitest (turbo)
pnpm lint    # 전 패키지 eslint
pnpm build   # 전 패키지 tsc + vite build
```

**커밋 전 3개 모두 통과 필수.** 단위 테스트 커버리지: 포인트 원장·지급수단(08)·레퍼럴(09) 계약,
주문 상태머신 전이, 매칭/추정, 쿠폰 원장(레거시 보존 회귀), 앱별 훅/화면. DB 계층은
pgTAP(`pnpm test:db` — 로컬 스택 필요, CI에서도 실행). 특정 패키지만 돌리려면
`pnpm --filter @oilpick/<name> test`.

---

## Edge Functions

`supabase/functions/`에 Deno 함수로 존재한다(총 14개):

```
order-create   order-accept   order-transition   order-expire   notify-broadcast
withdraw-request   withdraw-process   point-adjust   referral-code   referral-attach
price-set   cs-reply   rider-verify   rider-location
```

(07의 coupon-* 6종은 08 피벗 — 쿠폰 모델 폐기 — 으로 코드 삭제됐고, withdraw-request/
withdraw-process/point-adjust는 08에서 부활, referral-code/referral-attach는 09 신설.
PG 어댑터(`_shared/pg.ts`)·`PG_PROVIDER`도 쿠폰 결제와 함께 소멸 — 참조하는 함수 없음.)

- **로컬 실행**: `supabase functions serve` (curl 시나리오는 함수별 주석/02-api.md 참조).
- **배포**: `supabase functions deploy <name>` (또는 전체 `supabase functions deploy`).
- **secrets**: FCM 발송에 `FCM_SERVICE_ACCOUNT`가 필요하다. 미설정 시 `_shared/push.ts`는
  로그만 남기고 스킵하되 `notifications` 테이블 기록은 항상 수행한다(상태 전이·원장 등 핵심
  로직은 절대 막지 않음). 실 발송 활성화: `supabase secrets set FCM_SERVICE_ACCOUNT=@key.json`.
  09 레퍼럴 공유 링크 도메인이 `app.oilpick.kr`이 아니면 `REFERRAL_BASE_URL`도 설정(선택 —
  미설정 시 core 기본값. DEPLOY.md §1 참조).

> **주의(packages/core vendoring)**: Edge Function(Deno)은 `packages/core/src`의 확장자 없는
> 상대 import를 해석하지 못한다. `supabase/functions/_shared/vendor/build.sh`(esbuild)로
> core를 자기완결형 ESM으로 번들해 vendoring한다. **packages/core가 바뀌면 이 스크립트를
> 재실행**해 vendor 산출물을 갱신해야 한다.

### 절대 규칙 (요약 — 상세는 CLAUDE.md)
1. 포인트·쿠폰 원장은 클라이언트에서 절대 쓰지 않는다. `point_ledger`(현역 — 08 복권:
   EARN/WITHDRAW_*/ADJUST + 09 REFERRAL)·`coupon_ledger`(레거시 보존) insert는 Edge Function/
   service_role RPC에만. 잔액은 뷰 `v_point_balance`/`v_coupon_balance`로만 조회
   (`security_invoker=true`로 RLS 위임).
2. 주문 상태 전이는 Edge Function `order-transition`(RPC `fn_transition_order`)으로만.
3. 모든 테이블 RLS 필수. service_role 키는 Edge Function에서만.
4. 금액/포인트는 정수(원, P). 무게는 kg 소수 1자리. 시세는 주문 생성 시점 스냅샷(이후 변동 무영향).

---

## Capacitor 빌드 (모바일)

`apps/user`, `apps/rider`에 `ios/`, `android/` 네이티브 프로젝트가 이미 생성돼 있다.

```bash
# 앱 디렉터리에서 (예: apps/rider)
pnpm build                       # 웹 자산(dist) 생성
npx cap sync                     # dist + 플러그인을 네이티브에 동기화
npx cap open ios                 # Xcode 열기 (또는 android → Android Studio)
```

- **플러그인**: push-notifications / geolocation / camera / app / splash-screen,
  라이더 전용 `@capacitor-community/barcode-scanner`(QR 스캔).
- **딥링크 스킴**: `oilpick-user://orders/:id`, `oilpick-user://ref/:code`(09 추천 랜딩),
  `oilpick-rider://calls/:id` — 푸시 `link` 필드와 매핑(`deeplink.ts`의 `normalizeDeepLink`).
  rider는 서버의 `/orders/:id`·`/wallet` 링크를 `/calls/:id`·`/earnings`로 재매핑(알림함 포함).
- **권한 문구**: iOS `Info.plist`(위치=사용 중, 카메라 사용 사유), Android `AndroidManifest`
  (위치·카메라 권한 + intent-filter). rider 위치는 "항상 허용" 요구하지 않음(운행 화면 활성 시만).

> **iOS `pod install` — UTF-8 로케일 주의**: CocoaPods는 비-UTF-8 로케일에서 한글 경로/문구를
> 처리하다 `Unicode Normalization ... invalid byte sequence in US-ASCII`로 실패할 수 있다.
> 실행 전 로케일을 UTF-8로 고정한다:
> ```bash
> export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
> cd apps/rider/ios/App && pod install
> ```

> **아이콘/스플래시**는 현재 임시 placeholder(단색 primary 배경 + "OilPick")다. `@capacitor/assets`로
> 생성했으며 런칭 전 실제 브랜드 로고로 교체 전제.

---

## 배포 절차 (개요 — 상세·순서는 `DEPLOY.md`)

1. **DB + Edge Functions + 시크릿**: `supabase login` 후 `bash scripts/deploy-cutover.sh` 원샷
   (링크 → `db push` → `functions deploy`, 말미에 REFERRAL_BASE_URL·PG 시크릿 정리 안내).
   `seed.sql`은 로컬 전용 — 프로덕션 초기 데이터(admin 계정·초기 시세 tick)는 DEPLOY.md §1-1의
   SQL로 별도 생성.
2. **웹(3앱)**: Vercel에 같은 repo를 Root Directory만 달리해 3회 import(DEPLOY.md §2).
   user 프로젝트의 `VITE_APP_STORE_URL`/`VITE_PLAY_STORE_URL`은 선택(09 추천 랜딩 스토어 버튼 —
   미설정 시 비노출). `VITE_PG_PROVIDER`는 08 피벗으로 불필요(남아 있어도 무시).
3. **모바일(user/rider)**: 프로덕션 `.env`로 `pnpm build` → `npx cap sync` → Xcode/Android
   Studio에서 서명·아카이브 → App Store / Play Console 제출.
4. **런칭 전 필수 확인**(이 개발 환경에서 미검증): 실기기 FCM 푸시 수신, 딥링크 탭 이동,
   카카오맵 실렌더, 카메라 QR 스캔, 부하 상 일부 E2E — 상세는 `docs/spec/qa-checklist.md`.

---

## 트러블슈팅

- **Docker 부하로 Postgres 죽음/헬스체크 실패**: `supabase start --ignore-health-check`,
  docker 명령이 멈추면 30~60초 대기 후 재시도.
- **Edge Function "Module not found"**: packages/core 변경 후 vendor 미갱신 —
  `bash supabase/functions/_shared/vendor/build.sh` 재실행.
- **admin 로그인 500**: seed의 auth.users token 컬럼 NULL 이슈는 수정됨(빈 문자열 명시).
  재현 시 `docker logs supabase_auth_oilpick` 확인.
- **Supabase advisors**: 보안/성능 lint는 `docs/spec/qa-checklist.md`의 "Supabase advisors"
  절에 점검 결과가 기록돼 있다.

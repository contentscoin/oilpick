# OilPick 배포 가이드 (Supabase + Vercel)

두 배포는 순서가 있다: **Supabase 먼저**(백엔드·DB·인증), 그 다음 **Vercel**(앱). 앱은 Supabase
프로젝트의 URL·anon key가 있어야 동작하므로 Supabase가 선행이다.

---

## 1. Supabase (프로덕션 백엔드)

전제: Supabase 대시보드에서 프로젝트 생성 완료 → **Project Ref**(예: `abcd1234...`), **Project URL**
(`https://<ref>.supabase.co`), **anon(publishable) key**, **service_role key** 확보.

```bash
# CLI 로그인 & 링크
supabase login
supabase link --project-ref <PROJECT_REF>

# 마이그레이션 적용(16개) — Storage 버킷·RLS·RPC·권한가드까지 전부 포함.
# seed.sql은 로컬 전용이라 프로덕션엔 적용되지 않는다(아래 3-1에서 admin 수동 생성).
supabase db push

# Edge Functions 배포(11개). verify_jwt 등은 supabase/config.toml을 따른다.
supabase functions deploy

# 시크릿 설정
#  - FCM_SERVICE_ACCOUNT: 미설정 시 푸시는 no-op(알림 테이블 기록은 됨). 키 발급 후 설정.
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat fcm-service-account.json)"
#  - TOSS_SECRET_KEY: 토스페이먼츠 "시크릿 키"(07 F4, coupon-purchase-confirm/coupon-refund 전용).
#    클라이언트 키(VITE_TOSS_CLIENT_KEY, rider 앱 env)와 다르다 — 시크릿 키는 서버(Edge)에만 둔다.
#    미설정 시 confirm/refund가 PAYMENT_FAILED로 실패한다. 테스트 키(test_sk_...)로 개발/검증 가능.
supabase secrets set TOSS_SECRET_KEY="test_sk_xxxxxxxxxxxxxxxxxxxx"
#  - PG_PROVIDER(선택): 활성 PG 어댑터 선택(07 F14-①). 미설정=toss.
#    "koem"(코엠페이먼츠)은 어댑터 구현 전까지 설정 금지 — confirm/refund가 즉시 실패한다.
```

### 1-1. 프로덕션 초기 데이터(수동 — seed.sql은 로컬 전용)
프로덕션 DB에는 admin·집하장·시세 tick이 없다. 대시보드 SQL Editor 또는 psql로 최소 1회 생성:

- **admin 계정**: 로그인은 **아이디/비밀번호**다(이메일 아님). LoginPage가 입력한 아이디를
  `<아이디>@oilpick.local`로 매핑해 GoTrue에 넘긴다. 즉 아이디 `admin`은 내부적으로 이메일
  `admin@oilpick.local`로 인증된다. 대시보드 SQL Editor(=postgres)에서 아래처럼 1회 생성:
  ```sql
  set search_path = public, extensions;
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated',
    'admin@oilpick.local', crypt('<강한-비밀번호>', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}','{}', '','','','' )
  returning id;  -- 이 id로 아래 profiles insert
  insert into profiles (id, role, phone, display_name)
  values ('<위 id>','admin','-','관리자');
  ```
  빈 문자열 토큰 4개는 필수(GoTrue NULL-token 로그인 버그 회피). 권한가드 트리거상 role='admin'
  삽입은 service_role/postgres에서만 가능 — SQL Editor는 postgres라 OK.
  ⚠️ `crypt()`의 비밀번호는 반드시 강한 값으로 하고, **실제 비밀번호를 이 문서/리포지토리에 적지 말 것**.
  임시/약한 비밀번호로 만들었다면 런칭 전 교체:
  `update auth.users set encrypted_password=crypt('<강한값>',gen_salt('bf')) where email='admin@oilpick.local';`
- **집하장 1개 이상**: admin 웹의 집하장 관리에서 생성(또는 SQL). QR secret 자동 생성됨.
- **초기 시세 tick**: admin 웹의 시세 관리에서 첫 매입가·수거비 설정(`price-set`).

### 1-2. 인증(전화 OTP)
로컬은 `config.toml`의 test_otp(고정 123456)를 쓴다. **프로덕션은 실제 SMS 프로바이더 필요** —
대시보드 → Authentication → Providers → Phone에서 Twilio 등 설정. 그전까지 실사용자 가입 불가.
(⚠️ 런칭 크리티컬: 전자금융거래법·SMS 발신번호 사전등록 등 별도 확인 — docs/oilpick-launch-plan.md)

### 1-3. Auth Redirect / Site URL
대시보드 → Authentication → URL Configuration에 Vercel 앱 도메인(들)을 Site URL / Redirect URLs로 추가.

---

## 2. Vercel (앱 배포 — 하나의 repo, 서브도메인 접속포인트)

**구조**: 코드베이스(repo)는 하나. 접속포인트만 서브도메인으로 나눈다 —
`admin.oilpick.kr`(관리자), `app.oilpick.kr`(공급업체=user), `rider.oilpick.kr`(라이더).
같은 repo(contentscoin/oilpick)를 Vercel에 **앱 수만큼 import**해 각 프로젝트의 Root Directory만
다르게 준다. push 한 번이면 관련 프로젝트가 모두 자동 재배포된다. 앱마다 `vercel.json`이 SPA
라우팅(BrowserRouter → index.html rewrite)을 처리한다.

> 참고: "1개 Vercel 프로젝트로 3개 SPA를 서브도메인 라우팅"은 세 앱의 `/assets/*`가 한 출력 트리에서
> 충돌해 base-path/미들웨어를 얽어야 하므로 취약하다. **repo 하나 + 서브도메인별 프로젝트**가 결과는
> 동일(하나의 코드·push·CI)하면서 각 앱이 서브도메인 루트에서 base='/'로 깔끔히 뜬다.

### 각 프로젝트 설정 (Vercel 대시보드 → Add New Project → 같은 repo import)
프로젝트 3개(또는 필요한 앱만): 이름 예 `oilpick-admin` / `oilpick-user` / `oilpick-rider`.
- **Root Directory**: `apps/admin` / `apps/user` / `apps/rider`.
  (Vercel이 Turborepo+pnpm 워크스페이스를 감지 → 루트 lockfile로 install, 해당 앱만 build.)
- **Framework Preset**: Vite(자동). Output: `dist`(vercel.json에 framework=vite 지정됨).
- **환경변수**(Production + Preview):
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = anon(publishable) key
  - `VITE_KAKAO_KEY` = 카카오 JS 앱 키(선택 — 없으면 MapView는 일러스트 프리뷰, 주소검색 수동입력 폴백)

### 도메인/서브도메인 연결
1. Vercel(아무 프로젝트나) → Settings → Domains에 apex 도메인 `oilpick.kr` 추가 → DNS 안내대로
   네임서버/레코드 설정.
2. 각 프로젝트에 서브도메인 배정: admin 프로젝트에 `admin.oilpick.kr`, user 프로젝트에
   `app.oilpick.kr`, rider 프로젝트에 `rider.oilpick.kr`.
3. 도메인 연결 전에는 각 프로젝트가 무료 `*.vercel.app` URL로도 접속된다(예 `oilpick-admin.vercel.app`).
4. 배정한 서브도메인들을 Supabase Auth의 Site URL / Redirect URLs(1-3)에 추가.

### 어느 앱을 올릴지
- **admin**: 웹 전용 → 필수.
- **user / rider**: 최종은 앱스토어/플레이스토어(Capacitor). 웹 PWA/데모/테스트용으로 Vercel 배포도
  가능(같은 코드가 브라우저에서 동작).

---

## 3. 배포 후 점검
- admin 로그인(생성한 admin 계정) → 대시보드/시세/집하장 설정.
- user 앱: 가입(실 SMS) → 홈 실시세 표시 → 수거 요청 → 상태 Realtime 반영.
- rider 앱: 가입 → 서류 제출 → admin 승인 → 콜 수락 → 운행.
- Edge Functions 로그(대시보드 → Functions)로 order-transition/withdraw 등 정상 동작 확인.

## 참고
- `docs/spec/qa-checklist.md` 🔴 항목(실 푸시/딥링크/카메라 QR 등)은 실기기에서 재검증.
- Capacitor 네이티브 빌드(iOS/Android)는 별도(Xcode/Android Studio) — docs/spec/03-frontend.md,
  README의 Capacitor 섹션 참고. Vercel 배포와 무관.

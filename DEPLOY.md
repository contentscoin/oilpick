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
```

### 1-1. 프로덕션 초기 데이터(수동 — seed.sql은 로컬 전용)
프로덕션 DB에는 admin·집하장·시세 tick이 없다. 대시보드 SQL Editor 또는 psql로 최소 1회 생성:

- **admin 계정**: Supabase 대시보드 → Authentication → Add user로 이메일/비번 생성 후, 그 user id로
  `insert into profiles(id, role, phone, display_name) values ('<uid>','admin','-','관리자');`
  (권한가드 트리거상 role='admin' 삽입은 service_role/postgres에서만 가능 — SQL Editor는 postgres라 OK.)
- **집하장 1개 이상**: admin 웹의 집하장 관리에서 생성(또는 SQL). QR secret 자동 생성됨.
- **초기 시세 tick**: admin 웹의 시세 관리에서 첫 매입가·수거비 설정(`price-set`).

### 1-2. 인증(전화 OTP)
로컬은 `config.toml`의 test_otp(고정 123456)를 쓴다. **프로덕션은 실제 SMS 프로바이더 필요** —
대시보드 → Authentication → Providers → Phone에서 Twilio 등 설정. 그전까지 실사용자 가입 불가.
(⚠️ 런칭 크리티컬: 전자금융거래법·SMS 발신번호 사전등록 등 별도 확인 — docs/oilpick-launch-plan.md)

### 1-3. Auth Redirect / Site URL
대시보드 → Authentication → URL Configuration에 Vercel 앱 도메인(들)을 Site URL / Redirect URLs로 추가.

---

## 2. Vercel (앱 배포)

각 앱은 **독립 Vercel 프로젝트**로 배포한다(각자 도메인, base='/'). 앱마다 `vercel.json`이 이미 있어
SPA 라우팅(BrowserRouter → 모든 경로를 index.html로 rewrite)을 처리한다.

### 프로젝트별 설정 (Vercel 대시보드에서 repo import 시)
- **Root Directory**: `apps/user` / `apps/rider` / `apps/admin` 중 배포할 앱.
  (Vercel이 Turborepo+pnpm 워크스페이스를 감지해 루트 lockfile로 install, 해당 앱만 build.)
- **Framework Preset**: Vite (자동 감지). Output: `dist`(vercel.json framework=vite로 지정됨).
- **환경변수**(Production/Preview):
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = anon(publishable) key
  - `VITE_KAKAO_KEY` = 카카오 JS 앱 키(선택 — 없으면 MapView는 일러스트 프리뷰, 주소검색은 수동입력 폴백)

### 어느 앱을 Vercel에 올릴까
- **admin**(관리자 웹): 웹 전용 → **Vercel 필수**.
- **user / rider**: 최종 배포는 앱스토어/플레이스토어(Capacitor 모바일). 단 웹 PWA/테스트용으로 Vercel
  배포도 가능(같은 코드가 브라우저에서 동작). 필요에 따라 선택.

### CLI로 배포할 경우(대안)
```bash
cd apps/admin
vercel link          # Vercel 프로젝트 연결(팀/스코프 선택)
vercel env add VITE_SUPABASE_URL production      # 등 env 등록
vercel --prod        # 배포
```

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

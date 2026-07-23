# 오반장(OBJ) 배포 가이드 (Supabase + Vercel)

두 배포는 순서가 있다: **Supabase 먼저**(백엔드·DB·인증), 그 다음 **Vercel**(앱). 앱은 Supabase
프로젝트의 URL·anon key가 있어야 동작하므로 Supabase가 선행이다.

---

## 1. Supabase (프로덕션 백엔드)

전제: Supabase 대시보드에서 프로젝트 생성 완료 → **Project Ref**(예: `abcd1234...`), **Project URL**
(`https://<ref>.supabase.co`), **anon(publishable) key**, **service_role key** 확보.

> **원샷 실행**: 아래 1장(링크→마이그레이션 확인→`db push`→`functions deploy`)은
> `bash scripts/deploy-cutover.sh`가 순서대로 실행한다(프로젝트 ref 기본값 dbvgxuevhmyoprafarnh,
> `PROJECT_REF` env로 재정의). 수동 단계(초기 데이터·Vercel·coupon-* 삭제·REFERRAL_BASE_URL/
> PG 시크릿 정리)는 스크립트가 끝에서 다시 안내한다.

```bash
# CLI 로그인 & 링크
supabase login
supabase link --project-ref <PROJECT_REF>

# 마이그레이션 적용(31개) — Storage 버킷·RLS·RPC·권한가드·payout_method(08)·referrals(09)까지 전부 포함.
# seed.sql은 로컬 전용이라 프로덕션엔 적용되지 않는다(아래 3-1에서 admin 수동 생성).
supabase db push

# Edge Functions 배포(17개 — 08 withdraw-*/point-adjust 부활, 09 referral-code/attach/settle,
# 11 M9-b directions, 13 dealer-create/dealer-assign). verify_jwt 등은 supabase/config.toml을 따른다.
supabase functions deploy

# 시크릿 설정
#  - FCM_SERVICE_ACCOUNT: 미설정 시 푸시는 no-op(알림 테이블 기록은 됨). 키 발급 후 설정.
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat fcm-service-account.json)"
#  - REFERRAL_BASE_URL(선택, 09): 라이더 추천 공유 링크의 웹 랜딩 베이스. 미설정 시 core 기본값
#    https://app.oilpick.kr 사용 — 실제 user 앱 도메인이 다르면 반드시 설정(referral-code가 조립).
#  - KAKAO_MOBILITY_KEY(선택, M9-b): 인앱 경로선·ETA용 카카오모빌리티 Directions REST 키.
#    미설정 시 directions 함수가 configured:false로 조용히 비활성(라이더 위치 마커만 표시).
#    키 발급 후 설정하면 재배포 없이 즉시 활성화된다. 서버 시크릿(클라이언트 번들 금지).
# supabase secrets set KAKAO_MOBILITY_KEY="<카카오모빌리티 REST 키>"
# supabase secrets set REFERRAL_BASE_URL="https://app.oilpick.kr"
#  - PG 시크릿(TOSS_SECRET_KEY / PG_PROVIDER / KOEM_*)은 08 피벗(쿠폰 결제 폐기)으로 불필요 —
#    기존 설정돼 있어도 참조하는 함수가 없다(잔존 시 secrets unset으로 정리 가능. 07 F4/F14 이력 참조).
```

### 1-0. 08·09 컷오버 절차 (지급수단 피벗 + 레퍼럴 — 순서 엄수, 08-payout-pivot.md·09-referral.md §배포)
ⓐ `supabase db push` — 08: 20260715000001(payout_method — 순수 추가)·20260715000002(fn_transition_order 개정)
   + 09: 20260715000003(ledger REFERRAL enum)·20260715000004(referrals·RPC·뷰 — 전부 순수 추가) 적용.
ⓑ **REQUESTED·진행중(ACCEPTED/ARRIVED/DISPUTED) 잔존 주문 0건 확인** — coupon_cost 있는 잔존 주문이
   신 플로우와 섞이는 전환기 최소화(잔존분의 완결·환급은 RPC 레거시 분기가 처리하므로 강제는 아님).
ⓒ Edge Functions **같은 릴리즈로 동시 배포**: order-create/order-accept/order-transition +
   withdraw-request/withdraw-process/point-adjust + **referral-code/referral-attach(09)**
   (`supabase functions deploy`). ⚠️ order-transition이 완료 시 fn_activate_referral을 호출하므로
   ⓐ(마이그레이션)가 반드시 선행 — 순서가 뒤집히면 활성화가 조용히 실패(best-effort 로그만)한다.
   09 링크 도메인이 app.oilpick.kr이 아니면 `REFERRAL_BASE_URL` 시크릿을 이 단계 전에 설정.
ⓓ 앱 순차 배포: rider→user→admin (Vercel 재빌드 — main 병합 시 자동).
ⓔ coupon-* 6종 undeploy — ⓓ 완료 후(가동 중 구버전 앱 파손 방지):
   `supabase functions delete coupon-purchase-intent coupon-purchase-confirm coupon-purchase-return coupon-refund coupon-adjust coupon-price-set`
   DB의 fn_charge_coupon/fn_consume_coupon/fn_confirm_purchase/fn_refund_purchase·쿠폰 테이블은 **보존**(회계 기록).
ⓕ 데모 시나리오 재기록: ① 수거 요청 → 수락 → 계량+지급수단 선택 → 점주 확인(포인트 적립) → 지갑 출금
   신청 → admin 처리. ② (09) 라이더 "내 추천"에서 링크 복사 → 신규 점주 /ref/:code 가입 → 첫 수거 완료
   → 점주 지갑 REFERRAL +5,000P·라이더 실적 활성화·admin /referrals 퍼널 반영.

### 1-1. 프로덕션 초기 데이터(수동 — seed.sql은 로컬 전용)
프로덕션 DB에는 admin·시세 tick·쿠폰 단가가 없다. 대시보드 SQL Editor 또는 psql로 최소 1회 생성:

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
- **좌상(dealer) 계정**: 별도 SQL 불필요 — admin 로그인 후 웹 `/dealers`에서 생성(dealer-create Edge).
  생성된 좌상은 같은 admin 웹에 자기 아이디/비번으로 로그인하면 서브어드민 메뉴만 보인다(13).
- **초기 시세 tick**: admin 웹의 시세 관리에서 첫 매입가 설정(`price-set`). ⚠️ 미설정 시
  order-create가 404("현재 시세 정보를 찾을 수 없어요")로 막힌다 — 필수 초기 데이터.
  (쿠폰 단가는 08 피벗으로 폐기 — 설정 불필요.)

### 1-2. 인증(전화 OTP)
로컬은 `config.toml`의 test_otp(고정 123456)를 쓴다. **프로덕션은 실제 SMS 프로바이더 필요** —
대시보드 → Authentication → Providers → Phone에서 Twilio 등 설정. 그전까지 실사용자 가입 불가.
(⚠️ 런칭 크리티컬: 전자금융거래법·SMS 발신번호 사전등록 등 별도 확인 — docs/oilpick-launch-plan.md)

### 1-3. Auth Redirect / Site URL
대시보드 → Authentication → URL Configuration에 Vercel 앱 도메인(들)을 Site URL / Redirect URLs로 추가.

---

## 2. Vercel (앱 배포 — 하나의 repo, 서브도메인 접속포인트)

> **상태(2026-07-10)**: 프로젝트 3개(oilpick-admin/user/rider, 팀 jakes-projects) 운영 중 +
> `contentscoin/oilpick` **Git 연동 완료** — main에 커밋이 병합되면 3개 앱이 자동 재배포된다.
> 아래 "import" 절차는 신규 구축용 기록. 이 커밋 자체가 연동 후 첫 자동 배포 트리거(검증용).

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
  - `VITE_MAP_STYLE_URL` = MapLibre 타일(스타일 JSON URL 또는 {z}/{x}/{y} 래스터 템플릿 — VWorld 권장,
    11-map-renderer.md M8. 선택 — 없으면 MapView는 일러스트 프리뷰)
  - (user만) `VITE_KAKAO_KEY` = 카카오 JS 앱 키(주소검색용. 선택 — 없으면 수동입력 폴백)
  - (user만, 선택 — 09) `VITE_APP_STORE_URL` / `VITE_PLAY_STORE_URL` = 추천 랜딩(/ref/:code)의 스토어
    버튼 링크. 미설정 시 버튼 비노출(스토어 출시 후 설정).
  - (rider `VITE_PG_PROVIDER`는 08 피벗 — 쿠폰 결제 폐기 — 으로 불필요. 남아 있어도 무시된다.)

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
- admin 로그인(생성한 admin 계정) → 대시보드/시세 설정 + 출금 큐 확인. (집하장·쿠폰 단가는 일몰 — 설정 불필요.)
- user 앱: 가입(실 SMS) → 홈 실시세 표시 → 수거 요청 → 상태 Realtime 반영.
- rider 앱: 가입 → 서류 제출 → admin 승인 → 콜 수락 → 운행.
- (09) 레퍼럴 루프: 라이더 마이 → "내 추천" 코드 발급·shareUrl 도메인 확인(REFERRAL_BASE_URL 반영 여부)
  → /ref/:code 랜딩 접속 → 신규 점주 가입 → 첫 수거 완료 후 점주 지갑 REFERRAL 적립·admin /referrals 반영.
- Edge Functions 로그(대시보드 → Functions)로 order-transition/withdraw/referral-* 등 정상 동작 확인.

## 참고
- `docs/spec/qa-checklist.md` 🔴 항목(실 푸시/딥링크/카메라 QR 등)은 실기기에서 재검증.
- Capacitor 네이티브 빌드(iOS/Android)는 별도(Xcode/Android Studio) — docs/spec/03-frontend.md,
  README의 Capacitor 섹션 참고. Vercel 배포와 무관.

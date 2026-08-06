# 13 — 조직 계층: 어드민 – 좌상(서브어드민) – 라이더 (I-태스크)

2026-07-22 CEO 지시: "좌상이 어드민 페이지에서 서브어드민으로 지정되어 메뉴를 별도로 보여줘야
해. 라이더는 좌상의 소속으로 배정되고 **어드민 – 좌상 – 라이더** 구조를 가져야 해."
이 문서가 조직 계층·권한·화면의 단일 진실. 구현은 12-stabilization.md(안정화) 완료 후 착수 권장.

> **[2026-07-24 갱신]** D5의 "수수료·정산 로직 없음(확정)"은 **`14-fresh-oil-settlement.md`로 대체(supersede)**됐다.
> CEO 지시로 좌상 보증금 크레딧·현장 혼합정산·좌상↔어드민 정산 체인이 도입되며, 좌상 계정/정산 원장·
> 수수료율(초기 0%)·청구 라이프사이클은 14가 단일 진실이다. 아래 D5는 이력 참조용으로 보존한다.

## 용어·식별자
- **좌상**(유저 노출 표기): 지역 수거상 — 라이더를 소속으로 거느리고 관할 실적을 관리하는
  중간 관리자. 기술 식별자는 **`dealer`**(role 값·컬럼·함수명— 코드명 원칙은 10-brand.md B4 준용).
- 계층: **admin(본사) → dealer(좌상) → rider(라이더)**. supplier(점주)는 이 계층 밖(고객).

## 결정 사항 (D) — 2026-07-22 CEO 확정
| # | 결정 |
|---|---|
| D1 | `profiles.role`에 `'dealer'` 추가. 좌상도 GoTrue 계정(아이디/비번 — admin과 동일한 `<아이디>@oilpick.local` 매핑)으로 **admin 웹에 로그인**한다. 별도 앱 없음 |
| D2 | 소속: `rider_profiles.dealer_id uuid null references profiles(id)`. **null 허용**(미배정 라이더 = 본사 직속). 배정/해제는 admin + 해당 좌상(자기 소속 한정, D6) |
| D3 | **좌상 권한 = 소속 라이더 실적 통계 조회 + 라이더 모집·배정·승인(쓰기)**. 정산(금전)은 좌상이 통계를 보고 **자체 처리**(오프라인) — 앱에 좌상 정산/원장 로직 없음. 주문 상태전이·포인트/쿠폰 원장·출금·시세는 **불변**(CLAUDE.md 절대 규칙 1·2 유지 — 좌상도 여기엔 관여 못 함) |
| D4 | admin 웹 메뉴를 role로 분기: admin = 전체 메뉴 + "좌상 관리" 신설, dealer = **서브어드민 메뉴만**(관할 대시보드/소속 라이더/실적·통계) |
| D5 | ~~**수수료·정산 로직 없음(확정)**~~ → **14-fresh-oil-settlement.md로 대체(2026-07-24)**. (이력) 좌상에게는 소속 라이더의 **세부 실적 통계**(완료 건수·수거 kg·현금/포인트 지급합·레퍼럴 실적·기간별 집계)만 제공하고 정산은 좌상 자체 처리로 두었으나, 이후 좌상 보증금 크레딧·혼합정산·정산 체인이 14로 도입됨 |
| D6 | **라이더 승인: 좌상 전담 + 본사 병행**. 좌상은 **자기 소속** 라이더의 서류 검토·승인(verify_status 전이)을 수행. 본사(admin)는 전 라이더에 대해 승인/재정 권한 유지. 신규 라이더 모집도 좌상이 자기 소속으로 배정 후 승인(미배정 라이더는 admin이 배정). |
| D7 | **콜 배차: 전체 공개 유지(확정)**. 지역 제한 없음 — 모든 온라인 라이더에게 거리순 노출(현행 불변). |
| D8 | **소속 라이더 수 제한 없음(확정)**. 좌상당 상한/최소 요건 없음. |

## DB (마이그레이션 1건 + 01-db-schema.sql 동기화)
1. profiles.role 제약 갱신('admin','supplier','rider','dealer').
   **권한가드 트리거 갱신**: role='dealer' 부여/변경은 service_role만(기존 admin 승격 가드와 동일 패턴).
2. `alter table rider_profiles add column dealer_id uuid references profiles(id);`
   + `create index idx_rider_dealer on rider_profiles(dealer_id);`
3. RLS 정책 추가(전부 순수 추가 — 기존 정책 불변). dealer 판별은 `fn_is_dealer()`(auth.uid()의
   profiles.role='dealer') 헬퍼로:
   - `p_rider_profiles_read_by_dealer`: dealer가 `dealer_id = auth.uid()`인 rider_profiles **read**.
   - `p_rider_profiles_verify_by_dealer`: dealer가 자기 소속(`dealer_id = auth.uid()`) 라이더의
     **verify_status/서류 필드 update**(승인 전담, D6). 본사 admin의 기존 전권 정책은 그대로.
   - `p_rider_profiles_assign_by_dealer`: dealer가 **미배정(dealer_id is null)** 라이더를 자기
     소속으로 배정 + 자기 소속 해제(전담 모집, D6). 타 좌상 소속 재배정은 admin만.
   - `p_profiles_read_own_riders`: 소속 라이더의 profiles(이름/전화) read.
   - `p_orders_read_by_dealer`: 소속 라이더가 배정된 pickup_orders read(관할 운행 현황·통계 소스).
   - `p_referrals_read_by_dealer`: 소속 라이더의 referrals 행 read(실적).
4. 뷰 `v_dealer_rider_stats`(security_invoker): 라이더별 완료 건수·수거 kg·지급 합계(현금/포인트)·
   레퍼럴 실적(v_referral_stats 조인). dealer는 RLS로 자기 소속만, admin은 전체. **금액은 통계
   표시용일 뿐 — 정산 로직 없음(D5)**.
   [17 Q5] `coupon_used_qty`(완료 주문 coupon_cost 합) append — 쿠폰 실적도 조회 전용(정산 무관).
   경로 제약 포함 단일 진실은 17-coupon-revival.md C5.
5. pgTAP: 권한가드(비인가 dealer 승격 차단)·dealer가 남의 소속을 못 보/못 승인하는 것·미배정
   라이더 자기배정 가능·타좌상 소속 재배정 불가·뷰 집계 asserts.

## Edge Functions (2종 신설)
- `dealer-create`(admin 전용): 아이디/비번/상호/연락처 → auth.users 생성(@oilpick.local 매핑,
  GoTrue NULL-token 회피 패턴은 DEPLOY.md admin 생성 SQL과 동일) + profiles(role='dealer') insert
  (service_role — 권한가드상 role='dealer' 부여는 service_role만).
- `dealer-assign`(admin + 좌상): `{riderId, dealerId|null}` — rider_profiles.dealer_id 갱신.
  admin은 임의 배정, dealer는 **미배정 라이더를 자기(dealerId=self)로만** 배정/자기 소속 해제
  (서버에서 role·소유 검증 — RLS와 이중 방어). 02-api.md에 입출력·에러코드(NOT_FOUND/FORBIDDEN).
- 라이더 승인은 **기존 `rider-verify` Edge를 확장**(신설 아님): 호출자가 admin이거나 대상
  라이더의 dealer(자기 소속)면 허용(D6). 02-api §6 개정.

## 앱 변경 (admin 웹만 — rider는 표시 1곳)
- **로그인/셸**: 로그인 후 profiles.role 조회 — 'admin' | 'dealer' 외에는 거부(현행 admin 검사
  확장). `AdminShell` 메뉴를 role 필터로 렌더:
  - admin: 기존 전체 + **좌상 관리**(`/dealers`).
  - dealer: **관할 대시보드**(`/`) · **소속 라이더**(`/my-riders`, 승인 액션 포함) · **실적**(`/performance`)만.
- **/dealers**(admin): 좌상 목록·생성(dealer-create)·**수정(dealer-update — 아이디/비밀번호/상호/
  연락처 인라인 폼, CEO 2026-08-06 보강. 02-api §20-2)**·라이더 배정 UI(라이더 검색 → dealer-assign,
  미배정 라이더 필터). 라이더 상세(기존 Users/Riders 화면)에 소속 좌상 표시+변경.
- **dealer 화면**: 관할 대시보드(소속 라이더 진행중/오늘 완료/수거 kg — 기존 대시보드 훅 재사용,
  RLS가 범위 강제), 소속 라이더 목록(온라인/승인 상태·연락처 + **승인 버튼** rider-verify),
  실적·통계(v_dealer_rider_stats 테이블+기간 집계+CSV — ReferralsPage 패턴 재사용). **정산 화면 없음**
  (좌상 자체 처리 — 통계만 제공, D5).
- **rider 앱**: 마이페이지에 "소속: {좌상 상호}" 표시(read 1곳). 미배정이면 미표기.
- 알림/레퍼럴 등 기존 기능은 dealer와 무관(변경 없음).

## 태스크 분해 (I) — ✅ I1~I6 구현 완료(2026-07-22)
| # | 내용 | 상태 |
|---|---|---|
| I1 | DB(role 'dealer'+dealer_id+RLS 5 SELECT정책+fn_dealer_owns_rider+guard dealer_id+v_dealer_rider_stats)+pgTAP 14 asserts | ✅ (하네스 10스위트 171) |
| I2 | dealer-create/dealer-assign Edge + rider-verify dealer 확장 + core 스키마 + config + vendor + 02-api §6·20·21 | ✅ (정적 검증) |
| I3 | admin 셸 role 분기(AdminShell/AuthGuard/RoleGate) + /dealers 관리(생성·배정) | ✅ (AdminShell 5테스트) |
| I4 | dealer 관할 대시보드(소속 라이더+승인/정지/해제) + 실적통계(/performance, CSV) | ✅ (DealerHomePage 3테스트) |
| I5 | rider 마이페이지 "소속: {좌상 상호}" | ✅ |
| I6 | qa-checklist·DEPLOY·03-frontend 동기화 | ✅ |
> 설계 대비 축약: 좌상 화면은 3개 대신 2개(관할 대시보드에 소속 라이더+승인 통합, 실적통계 분리)로
> 합쳤다 — 정산 화면이 없어(D5) 라이더 목록을 대시보드에 두는 편이 자연스럽다. 쓰기(배정/승인)는
> RLS UPDATE 정책 대신 Edge(service_role)+서버 소유권 검증으로 일원화(guard 트리거가 dealer_id·
> verify_status 직접 변경을 막으므로) — RLS는 SELECT 5정책만.

## 오픈 질문 — ✅ 전부 확정(2026-07-22)
1. 수수료 모델 → **금전 로직 없음. 실적 통계만 제공, 좌상 자체 정산**(D5).
2. 라이더 모집/승인 → **좌상 전담 + 본사 병행**(D6).
3. 콜 배차 지역 제한 → **없음, 전체 공개 유지**(D7).
4. 소속 라이더 수 제한 → **없음**(D8).

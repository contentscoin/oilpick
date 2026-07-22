# 13 — 조직 계층: 어드민 – 좌상(서브어드민) – 라이더 (I-태스크)

2026-07-22 CEO 지시: "좌상이 어드민 페이지에서 서브어드민으로 지정되어 메뉴를 별도로 보여줘야
해. 라이더는 좌상의 소속으로 배정되고 **어드민 – 좌상 – 라이더** 구조를 가져야 해."
이 문서가 조직 계층·권한·화면의 단일 진실. 구현은 12-stabilization.md(안정화) 완료 후 착수 권장.

## 용어·식별자
- **좌상**(유저 노출 표기): 지역 수거상 — 라이더를 소속으로 거느리고 관할 실적을 관리하는
  중간 관리자. 기술 식별자는 **`dealer`**(role 값·컬럼·함수명— 코드명 원칙은 10-brand.md B4 준용).
- 계층: **admin(본사) → dealer(좌상) → rider(라이더)**. supplier(점주)는 이 계층 밖(고객).

## 결정 사항 (D)
| # | 결정 |
|---|---|
| D1 | `profiles.role`에 `'dealer'` 추가. 좌상도 GoTrue 계정(아이디/비번 — admin과 동일한 `<아이디>@oilpick.local` 매핑)으로 **admin 웹에 로그인**한다. 별도 앱 없음 |
| D2 | 소속: `rider_profiles.dealer_id uuid null references profiles(id)`. **null 허용**(미배정 라이더 = 본사 직속). 배정/해제는 admin만 |
| D3 | 좌상 권한(1차)은 **조회 전용**: 소속 라이더의 프로필·운행 현황·실적·레퍼럴 통계 읽기. 주문 개입·포인트/출금 처리·시세 등 **쓰기 권한 없음**(원장·전이 규칙 불변 — CLAUDE.md 절대 규칙 1·2 유지) |
| D4 | admin 웹 메뉴를 role로 분기: admin = 전체 메뉴 + "좌상 관리" 신설, dealer = **서브어드민 메뉴만**(관할 대시보드/소속 라이더/실적) |
| D5 | 좌상 수수료·정산 모델은 **미확정 — CEO 결정 필요**(예: 소속 라이더 수거 kg당 수수료, 라이더 마진 셰어, 고정 월비). 확정 전까지 금전 로직은 만들지 않는다(조직·가시성만) |

## DB (마이그레이션 1건 + 01-db-schema.sql 동기화)
1. `alter type` 불가한 check 제약이면 profiles.role 제약 갱신('admin','supplier','rider','dealer').
   **권한가드 트리거 갱신**: role='dealer' 부여/변경은 service_role만(기존 admin 승격 가드와 동일 패턴).
2. `alter table rider_profiles add column dealer_id uuid references profiles(id);`
   + `create index idx_rider_dealer on rider_profiles(dealer_id);`
3. RLS 정책 추가(전부 순수 추가 — 기존 정책 불변):
   - `p_rider_profiles_read_by_dealer`: dealer가 `dealer_id = auth.uid()`인 rider_profiles read.
   - `p_profiles_read_own_riders`: 소속 라이더의 profiles(이름/전화) read.
   - `p_orders_read_by_dealer`: 소속 라이더가 배정된 pickup_orders read(관할 운행 현황).
   - referrals: 소속 라이더의 행 read(`p_referrals_read_by_dealer`).
4. 뷰 `v_dealer_rider_stats`(security_invoker): 라이더별 완료 건수·수거 kg·지급 합계(현금/포인트)·
   레퍼럴 실적(v_referral_stats 조인) — dealer는 RLS로 자기 소속만 보인다.
5. pgTAP: 권한가드(비인가 dealer 승격 차단)·dealer가 남의 소속을 못 보는 것·뷰 집계 asserts.

## Edge Functions (2종 신설 — service_role 전용 쓰기 원칙 유지)
- `dealer-create`(admin 전용): 아이디/비번/상호/연락처 → auth.users 생성(@oilpick.local 매핑,
  GoTrue NULL-token 회피 패턴은 DEPLOY.md admin 생성 SQL과 동일) + profiles(role='dealer') insert.
- `dealer-assign`(admin 전용): `{riderId, dealerId|null}` — rider_profiles.dealer_id 갱신(배정/해제).
  02-api.md에 입출력·에러코드(NOT_FOUND/FORBIDDEN) 명세 추가.

## 앱 변경 (admin 웹만 — rider는 표시 1곳)
- **로그인/셸**: 로그인 후 profiles.role 조회 — 'admin' | 'dealer' 외에는 거부(현행 admin 검사
  확장). `AdminShell` 메뉴를 role 필터로 렌더:
  - admin: 기존 전체 + **좌상 관리**(`/dealers`).
  - dealer: **관할 대시보드**(`/`) · **소속 라이더**(`/my-riders`) · **실적**(`/performance`)만.
- **/dealers**(admin): 좌상 목록·생성(dealer-create)·라이더 배정 UI(라이더 검색 → dealer-assign,
  미배정 라이더 필터). 라이더 상세(기존 Users/Riders 화면)에 소속 좌상 표시+변경.
- **dealer 화면**: 관할 대시보드(소속 라이더의 진행중 주문 수·오늘 완료·수거 kg — RLS가 범위를
  강제하므로 쿼리는 기존 대시보드 훅 재사용+필터), 소속 라이더 목록(온라인/승인 상태·연락처),
  실적(v_dealer_rider_stats 테이블+CSV — ReferralsPage 패턴 재사용).
- **rider 앱**: 마이페이지에 "소속: {좌상 상호}" 표시(read 1곳). 미배정이면 미표기.
- 알림/레퍼럴 등 기존 기능은 dealer와 무관(변경 없음).

## 태스크 분해 (I)
| # | 내용 | 완료 기준 |
|---|---|---|
| I1 | DB 마이그레이션+RLS+뷰+pgTAP, 01/00 문서 동기화 | pgTAP green(신규 asserts 포함) |
| I2 | dealer-create/dealer-assign Edge + 02-api 명세 + vendor | 정적 검증+config.toml 등록 |
| I3 | admin 셸 role 분기 + /dealers 관리 화면 | admin/dealer 계정별 메뉴 스냅샷 테스트 |
| I4 | dealer 서브어드민 3화면(대시보드/소속 라이더/실적) | RLS 범위 강제 확인(남의 소속 미노출) |
| I5 | rider 마이페이지 소속 표시 | 단위 테스트 |
| I6 | qa-checklist·DEPLOY(초기 좌상 계정 생성 절차) 갱신 | 문서 동기화 |

## 오픈 질문 (CEO 확정 필요 — 구현 전 답 필요)
1. **좌상 수수료 모델**(D5): 어떤 기준으로 얼마를, 언제(월/건별) 정산하나? → 확정 시 원장
   entry_type 신설 여부 포함 08 모델 위에 별도 설계.
2. 좌상이 라이더 **모집/승인**에도 관여하나(현행: admin이 서류 승인)? 관여 시 승인 플로우에
   dealer 단계 추가 설계 필요.
3. 콜 배차가 좌상 관할 **지역**으로 제한되나(현행: 전체 콜 공개 + 거리순)? 제한 시 지역
   폴리곤/반경 모델 필요 — 별도 스펙.
4. 좌상 하나에 라이더 수 상한/최소 요건이 있나?

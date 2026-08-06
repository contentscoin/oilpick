# 19. 어드민 콘솔 고도화 + 바코드 유통이력 (10차, T-태스크)

지시(CEO 2026-08-06):
1. 어드민 UI/UX 고도화
2. 계정 및 좌상·라이더 관리와 정보수정 고도화
3. 좌상 관리자 페이지 고도화 — 누락된 정보·데이터 연결값 정리
4. **폐식용유 바코드별 유통이력**이 정리되어 표기 — 새로운 메뉴 구성

이 문서는 위 4건의 단일 진실이다. **정보구조(라우팅 role 게이트)·상태머신·원장 규칙은 불변** —
08/13/14/16/17/18 위에 순수 추가(조회 지면 + admin 전용 정보수정 경로)만 한다.

---

## §0. 현행 실태(착수 전 실측, 2026-08-06 main `1318e0a`)

| 영역 | 실태 | 판정 |
|---|---|---|
| `pickup_items`(바코드 1급, 14 J1) | 라이더 SUBMIT_MEASURE가 적재 중. **읽는 화면이 3앱 어디에도 없다** | 데이터는 쌓이는데 지면이 0 — 신규 메뉴로 해소 |
| admin 주문 목록 "라이더" 컬럼 | `rider_profiles.vehicle_number`를 라이더명으로 표기(`fetchNameMaps`) | 데이터 연결 오류 |
| admin 주문 목록 `arrivedAt` | `pickup_orders.arrived_at`(14 J1 신설)을 두고 `order_events`를 재조회 | 죽은 경로 + 쿼리 1회 낭비 |
| 주문 상세 드로어 | 좌상·정산청구·바코드·신유(구매)·도착시각·순액(net_amount) 전부 미표시 | 데이터 연결 누락 6종 |
| 회원 관리(/users) | 검색·정렬·상세 없음. 공급업체는 7컬럼 표 + 포인트조정 버튼뿐 | 계정 관리 기능 부족 |
| 회원 정보수정 | **경로 없음**. `p_profiles_update`는 `id = auth.uid()`뿐이라 admin이 회원 이름·연락처를 못 고친다 | 신규 Edge 필요 |
| 좌상 관리(/dealers) | 목록에 소속 라이더 수·사용액·미청구액 없음. 배정 리스트는 검색 없는 평면 목록 | 조직 관제 정보 부족 |
| 좌상 콘솔(dealer role) | 관할 대시보드 KPI 4종이 전부 "인원수" 축 — 이번달 실적/정산/크레딧 잔여가 없음 | 누락 정보 |
| admin 공용 UI | Button·Badge·Card·Modal·탭·빈상태가 페이지마다 인라인 Tailwind 문자열로 중복 | 톤 불일치 |

---

## §1. 결정 (T-태스크)

### T1. 스펙 = 이 문서

### T2. DB — 바코드 유통이력 뷰 2종 (`20260806000004_barcode_trace.sql`)

바코드는 **폐식용유 용기(말통)의 식별자**다. 같은 바코드가 회차를 달리해 여러 주문에 등장한다
(`unique(order_id, barcode)`는 주문 내 중복만 막는다). 따라서 "유통이력" = **바코드 1개의 회수
이벤트 시계열**이며, 각 이벤트는 `pickup_items` 1행이다.

- **`v_barcode_trace`** (`security_invoker = true`) — 회수 이벤트 1건 = 1행. `pickup_items`에
  주문·매장·라이더·좌상·정산청구를 연결한 비정규화 뷰.
  컬럼: `barcode, item_id, order_id, rider_id, rider_name, vehicle_number, supplier_id,
  store_name, pickup_address, dealer_id, dealer_name, order_status, order_kind, measured_kg,
  final_kg, payout_method, cash_paid_amount, purchase_amount, net_amount, dealer_settlement_id,
  settlement_status, photo_url, geo_lat, geo_lng, captured_at, recorded_at, order_created_at,
  completed_at`
- **`v_barcode_summary`** (`security_invoker = true`) — 바코드 1개 = 1행 집계.
  컬럼: `barcode, pickup_count, order_count, rider_count, first_seen_at, last_seen_at,
  last_order_id, last_rider_id`
- 정렬 축 `seen_at` = `coalesce(captured_at, created_at)` — 디바이스 촬영 시각 우선, 없으면 서버 적재 시각.

**`security_invoker = true`인 이유**(18 S1의 반대 결론): 이 뷰들은 조인 대상 전부에
`is_admin()` 분기가 있는 정책(`p_pickup_items_read`, `p_orders_read`, `p_sup_self`,
`p_rider_self`, `p_profiles_self`)만 참조하므로 invoker 권한으로도 admin 조회가 붕괴하지 않는다.
`v_rider_credit`이 definer여야 했던 이유는 라이더가 `dealer_accounts`를 못 읽어 조인이
무너졌기 때문 — 여기엔 그 구조가 없다. invoker를 쓰면 **점주·라이더가 자기 행만 보는 성질이
공짜로 따라오고**, 뷰가 RLS 우회 경로가 되지 않는다.

**가시성 결정**: 유통이력 메뉴는 **admin 전용**. 좌상(dealer)은 `pickup_items` 읽기 정책이 없어
행이 0건으로 보인다(= 정보 미누출). 좌상 확장은 후속 과제로 보류한다(§4).

pgTAP: `columns_are` 2종 + `security_invoker` 설정 확인 + 좌상 롤에서 0행.

### T3. admin 공용 UI 프리미티브 + 셸 메뉴 재구성

`apps/admin/src/components/ui/` 신설(앱 내부 전용 — `packages/ui`는 03 스펙대로 admin에서
재사용하지 않는다. `MapView`만 기존 예외 유지).

| 컴포넌트 | 역할 |
|---|---|
| `Button` | `variant`: primary/secondary/ghost/danger, `size`: sm/md. 최소 높이 토큰 고정 |
| `Badge` | `tone`: neutral/primary/accent/success/warning/danger |
| `Card` / `CardSection` | 흰 카드 + `shadow-card` + 제목/설명 슬롯 |
| `PageHeader` | 제목·설명·우측 액션. 전 페이지 헤더 통일 |
| `StatCard` | KPI 타일(label/value/sub/tone) |
| `Tabs` | pill 탭(현재 /users·/settlement에 중복된 마크업 대체) |
| `SearchInput` | 검색 입력(라벨 숨김 + 지우기) |
| `EmptyState` | 빈 목록 안내(제목·설명·액션) |
| `TableShell` | 가로 스크롤 래퍼 + sticky thead + 로딩/에러/빈 행 처리 |
| `Drawer` | 우측 드로어(ESC 닫기·초기 포커스 — 기존 훅 재사용) |
| `DescriptionList` | 라벨-값 정보 그리드(상세 공통) |

**레이아웃 강건성(03)** 준수: 고정 height 금지(minHeight+padding), nowrap은
`truncate + min-w-0` 3종 세트, 정보 행 `flex-wrap`.

셸 내비를 **그룹**으로 재편(라우트·role 게이트 불변, 표시만 그룹핑):

```
운영      대시보드 · 주문 관리 · 시세 관리
조직·회원  회원 관리 · 좌상 관리
정산      정산 · 좌상 정산
추적·분석  유통이력(신설) · 레퍼럴
지원      CS · 공지
```

### T4. 회원 관리 고도화 (`/users`) + 정보수정 Edge

- **검색·필터**: 공급업체(상호/담당자/사업자번호/전화), 라이더(이름/차량번호/전화) — 클라이언트
  필터(현 데이터 규모 기준. 서버 페이지네이션은 후속).
- **상세 드로어**: 행 클릭 → 우측 드로어.
  - 공급업체: 기본정보 + **포인트 잔액(`v_point_balance`)** + **최근 주문 10건**(상태·확정kg·지급액) +
    누적 판매 합계 + [포인트 조정] + [정보수정]
  - 라이더: 기본정보 + 서류 3종 + **소속 좌상** + **개인 한도/사용액(`v_rider_credit`)** +
    **쿠폰 잔액** + 최근 주문 10건 + [정보수정]
- **신규 Edge `user-update`** (admin 전용, `02-api.md §22`):
  - 입력 `{ userId, displayName?, phone?, storeName?, bizNumber?, address?, vehicleNumber?,
    recyclerName?, recyclerContact? }` — 전부 선택, 최소 1개 필수.
  - 대상 `profiles.role ∈ {supplier, rider}`만(admin·dealer는 404 — 좌상은 기존 `dealer-update`).
  - `profiles`(display_name/phone)는 **service_role로만 갱신 가능**(`p_profiles_update`가
    본인 한정). supplier/rider 프로필 컬럼도 같은 Edge에서 함께 갱신해 감사 경로를 하나로 둔다.
  - **금지 필드**: `verify_status·dealer_id·credit_limit`(각각 `rider-verify`·`dealer-assign`·
    `dealer-rider-limit-set` 전용 — `guard_rider_verify`가 이중 방어), `role`, 포인트·쿠폰 잔액.

### T5. 좌상 관리 고도화 (`/dealers`)

- 좌상 목록을 카드로 승격: 소속 라이더 수(승인/대기) · 배분 모드 배지 · **한도/사용/잔여 게이지** ·
  미청구 사용액 · 한도 미설정 경고(18 R8 유지) · [수정] 인라인 폼(기존 유지).
- 라이더 배정: **검색 + 소속 필터**(미배정만/특정 좌상) + 현재 소속 배지.

### T6. 좌상 콘솔(dealer role) 고도화 — 누락 정보 연결

- 관할 대시보드 KPI를 **6종**으로: 소속 라이더 · 승인 대기 · 진행중 운행 · 이번달 완료건 ·
  이번달 수거kg · **크레딧 잔여**(`v_dealer_statement.headroom`).
- 크레딧 카드에 게이지바(사용/한도) 추가 — 라이더 게이지(18 R4)와 같은 시각 언어.
- 소속 라이더 목록에 **검색** + 실적(완료건·수거kg·쿠폰) 인라인 표시 — `v_dealer_rider_stats`가
  이미 주는데 화면에서 쿠폰만 쓰던 값을 마저 연결한다.
- 정산 명세(`/statement`): 미정산 라인 합계와 `usage` 카드의 **대사 일치 표시**(차이 있으면 경고).

### T7. 유통이력 신규 메뉴 (`/traceability`, admin 전용)

- **바코드 검색**: 입력 → `v_barcode_summary`에서 부분일치(`ilike`) 목록.
- **최근 회수 바코드**: 기본 목록(최근 회수순) + 기간 필터 + 페이지네이션(50건).
- **상세 패널**: 선택 바코드의 회수 이력 타임라인(회차 역순).
  각 회차: 회수일시 · 매장(주소) · 라이더(차량번호) · 좌상 · 주문상태 · 확정kg ·
  지급수단/금액 · 정산 청구 상태 · GPS(지도 링크) · 현장 사진.
- **CSV 내보내기**: 검색 결과 목록 / 선택 바코드 이력 각각(기존 `lib/csv.ts` 재사용).
- 주문 상세로의 상호 링크(주문 관리 ↔ 유통이력).

### T8. 주문 데이터 연결 보강 (`/orders`)

- 목록 "라이더" 컬럼: `display_name` 표기 + 차량번호는 보조 표기(현행은 차량번호를 이름 자리에 출력).
- `arrivedAt`: `pickup_orders.arrived_at` 1급 컬럼 사용 — `order_events` 재조회 제거(14 J1 반영).
- 상세 드로어에 누락 6종 추가: **좌상 · 정산 청구(상태) · 신유(신청/배달 통수·대금) ·
  상계 순액(net_amount) · 도착시각 · 바코드(개수 + 유통이력 링크)**.

---

## §2. 불변 규약(재확인)

- 포인트·쿠폰 원장 클라이언트 쓰기 금지(절대 규칙 1) — 이 문서의 모든 신규 지면은 **조회 전용**이며,
  쓰기는 `point-adjust`·`coupon-*`·`user-update` 등 기존/신규 **Edge Function만** 경유한다.
- 주문 상태 전이는 `order-transition`만(절대 규칙 2) — 유통이력 화면에 상태 액션을 두지 않는다.
- 신규 뷰는 전부 조회 전용. 쓰기 정책을 만들지 않는다.
- `rider_profiles.verify_status/dealer_id/credit_limit`은 `user-update`가 건드리지 않는다.

## §3. 완료 기준

- [ ] `pnpm test` / `pnpm lint` / `pnpm build` 3종 통과
- [ ] pgTAP: 신규 뷰 컬럼 집합 + invoker 설정 + 좌상 롤 0행
- [ ] admin 3개 role 시나리오 수동 확인(admin 전 메뉴 / dealer 3메뉴 / 미인증 리다이렉트)
- [ ] 글자 확대 1.3~2배에서 신규 화면 가로 스크롤 없음(03 레이아웃 강건성)

## §5. 좌상↔라이더 데이터 불일치 수정 (T10, CEO 2026-08-06 지적)

### 실측 재현 (로컬 클러스터, 마이그레이션 전량 적용)

라이더가 **좌상A 소속으로 14,000P 주문을 완료**한 뒤 **좌상B로 재배정**:

| 조회 주체 | `v_dealer_rider_stats.point_paid` | `v_dealer_statement.usage` |
|---|---|---|
| 좌상A | (라이더 행 없음) 0 | **14,000P** |
| 좌상B | **0** | 0 |
| **admin** | **14,000P** ← 좌상B 소속으로 계상 | — |

### 원인 — 뷰에 귀속 축이 없었다

`v_dealer_rider_stats`의 집계 서브쿼리 조건은 `where rider_id is not null`뿐이었다. 좌상 축이
없으니 실제 필터를 **RLS가 우연히 대신**하고 있었다:

- 좌상이 조회 → `p_orders_read_by_dealer`(스냅샷 `dealer_id = auth.uid()`)가 걸러 줌 → 자기 귀속분만
- admin이 조회 → `is_admin()`으로 전 주문이 보임 → **라이더의 전 생애 실적이 현재 소속 좌상에 계상**

즉 **같은 뷰·같은 라이더인데 보는 사람에 따라 값이 달라진다.** 정산(`v_dealer_statement`)·
크레딧(`v_rider_credit`, 18 R6)은 전부 스냅샷 축이라, 실적만 축이 달라 대사가 원천 불가능했다.

### T10-a. DB — 귀속 축 명시 (`20260806000005_dealer_rider_stats_axis.sql`)

집계를 lateral로 바꾸고 `o.dealer_id is not distinct from rp.dealer_id`를 넣어 **스냅샷 축으로
못 박는다**(정산·크레딧과 동일 축). 컬럼 순서·이름·타입 불변.

- 좌상 화면 동작 **변화 없음**(지금까지 RLS가 만들어 주던 값이 곧 이 축) — 교정되는 건 admin 조회값
- `=` 대신 `is not distinct from`: 본사 직속(`dealer_id` null) 라이더의 본사 직속 주문이
  null 비교로 통째로 증발하는 것을 막는다
- pgTAP 23번 스위트 9개가 계약 고정: 좌상 시점 = admin 시점 · 재배정 후 새 좌상 0 ·
  옛 좌상 정산 유지 · 본사 직속 실적 보존

### T10-b. 화면 — 남는 비대칭을 KPI가 설명한다

라이더가 떠나면 **그 라이더 행 자체가 좌상 목록에서 사라진다**. 내 소속이던 동안의 주문은
정산에는 남지만 실적 목록으로는 볼 수 없다(뷰가 라이더 행 기반이라 구조적으로 그렇다).
라이더 행 합계로 KPI를 만들면 정산과 영구히 어긋나므로:

- KPI **완료 주문·누적 지급액** = 좌상 축 총계(`v_dealer_settlement_orders`, `useDealerCompletedTotals`)
- 실적 목록·누적 수거 = 현 소속 라이더의 내 귀속분(라벨에 명시)
- 두 축의 차이가 있으면 `전 소속 라이더 귀속분 N건 포함` 배지 + 목록 상단 안내

## §4. 보류(후속 과제)

- 좌상에게 유통이력 공개(= `pickup_items` 좌상 읽기 정책 + 매장 PII 범위 결정 필요)
- 신유(새 식용유) 배달 통 바코드 수집 — 현재 배달은 통수(`delivered_cans`)만 기록하므로
  "출고→매장" 구간이 이력에 없다. 수집 지점(라이더 배달 확인)부터 설계해야 한다.
- 회원 목록 서버 페이지네이션·정렬(현 규모에선 클라이언트 필터로 충분)

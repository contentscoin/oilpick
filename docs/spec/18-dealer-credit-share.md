# 18. 좌상 크레딧 공유·배분 + 라이더 가시성 (9차 고도화, R-태스크)

> CEO 지시(2026-08-06 3차): "좌상과 라이더 관계·소속을 점검해 문제를 해결하라. 좌상의 포인트를
> 각 라이더에게 공유하는 기능이 필요하다 — **총량에서 쓰게 하거나 사용한도를 배분**해줄 수 있어야
> 한다. 라이더도 **자기가 쓸 수 있는 포인트 한도를 게이지바로** 볼 수 있어야 한다."
>
> 이 문서는 **14-fresh-oil-settlement.md의 좌상 크레딧(C5) 위 순수 추가**다. 보증금·정산 청구
> 라이프사이클·수수료율·상태머신·원장 규칙은 전부 불변. 바뀌는 것은 ① 크레딧 소비 게이트가
> "좌상 총량 1단"에서 "좌상 총량 + (선택) 라이더 개인 한도 2단"이 되는 것, ② 라이더가 자기 한도를
> 볼 수 있게 되는 것뿐이다.

## 1. 현행 진단 (구현 코드 실측, 2026-08-06)

### 1-1. 소속 관계는 견고하다 (변경 없음)
- `rider_profiles.dealer_id` — 배정은 `dealer-assign` Edge(service_role)만. `guard_rider_verify`
  트리거가 셀프 가입 시 `dealer_id := null`, 셀프 수정 시 `old.dealer_id` 복원으로 **소속 위조를
  원천 차단**한다(13 I2).
- `pickup_orders.dealer_id` — ACCEPT 시점 **스냅샷**. 라이더가 나중에 다른 좌상으로 재배정돼도
  과거 채무 귀속과 PII 노출 범위가 흔들리지 않는다(14 §2-6).
- RLS 5종(소속 라이더 프로필/이름·전화/주문/추천/자기 좌상 상호)이 조회 범위를 강제한다.
- **결론: 관계 모델 자체에 결함 없음.** 아래 3건은 관계가 아니라 *크레딧 운용*의 공백이다.

### 1-2. 확인된 결함 3건

| # | 결함 | 현행 동작 | 영향 |
|---|------|-----------|------|
| **X1** | **신규 좌상 = 무제한 크레딧** | `dealer-create`가 `dealer_accounts` 행을 만들지 않는다. `fn_settle_trade` 게이트는 `if v_credit_limit is not null`이라 **계정 행이 없으면 게이트 자체를 건너뛴다**(14 §10 #2 결정). admin이 정산 화면에서 수동 등록하기 전까지 그 좌상 소속 라이더는 무한히 POINT를 발행할 수 있다 | 보증금 담보 없는 외상채권이 무제한 누적. 실제 좌상 온보딩 순서상 **가장 먼저 열리는 구멍** |
| **X2** | **한도 초과 에러가 점주에게 표면화** | 라이더가 POINT로 계량 제출 → 점주가 [확인]을 누르는 순간 `DEALER_LIMIT_EXCEEDED`(409). 점주 화면에 "라이더 소속 좌상의 사용한도를 초과했어요"가 뜬다 | 원인 제공자(라이더/좌상)는 모르고 **무관한 점주가 막힌다**. 현장에서 재제출 왕복 발생. 2자 확인 원칙이 깨지는 건 아니지만 책임 소재와 UX가 어긋남 |
| **X3** | **라이더별 배분 불가 (CEO 지시 핵심)** | `credit_limit`은 좌상 1개 값이고 소속 라이더 전원이 **선착순으로 같은 풀을 소진**한다. 한 라이더가 총량을 다 써도 좌상에게 통제 수단이 없다 | 좌상이 라이더를 늘릴수록 리스크 통제 불가. 신뢰도 낮은 신규 라이더에게 한도를 조일 방법이 없음 |

## 2. 결정 사항 (R) — 2026-08-06 CEO 확정

| # | 결정 | 내용 |
|---|------|------|
| **R1** | **두 가지 배분 모드** | `dealer_accounts.allocation_mode enum('POOL','PER_RIDER') default 'POOL'`. **POOL** = 현행(총량 공유, 선착순) — 기존 좌상은 전부 이 값이라 **동작 무변경**. **PER_RIDER** = 라이더별 한도 배분 |
| **R2** | 라이더 개인 한도 | `rider_profiles.credit_limit int null`. **PER_RIDER 모드에서만 의미**를 갖는다. `null` = **미배분 = 0**(명시 배분한 라이더만 POINT 지급 가능). POOL 모드에서는 무시 |
| **R3** | 2단 게이트 | `fn_settle_trade`의 POINT·net>0 분기에서 ① **좌상 총량**(기존 그대로, 모드 무관 항상) → ② PER_RIDER면 **라이더 개인 한도**를 추가 검사. 개인 초과 시 `RIDER_LIMIT_EXCEEDED`(409). 좌상 총량은 어떤 모드에서도 상한이다(배분 합계가 총량을 넘어도 총량이 최종 방어선) |
| **R4** | 사용액 정의 | 라이더 사용액 = `pickup_orders`에서 `rider_id=본인 ∧ dealer_id=소속 ∧ status='COMPLETED' ∧ dealer_settlement_id is null ∧ payout_method='POINT'`인 `net_amount` **순액** 합(음수=신유 구매 상계도 반영). 좌상 총량 사용액(14 §2-5)과 **같은 분모** — `net_amount > 0`으로 거르면 좌상 채무를 되돌린 라이더가 개인 한도만 계속 소진해 부당하게 잠긴다. 정산 청구가 완료되면 라이더 한도도 함께 회복된다 |
| **R5** | 배분 합계 vs 총량 | 배분 합계가 좌상 총량을 **초과해도 저장은 허용**(오버부킹 — 실무상 여유 배분 관행). 단 UI가 합계/총량을 항상 보여주고 초과 시 경고. 실제 지급은 R3의 2단 게이트가 막는다 |
| **R6** | 라이더 가시성 | 뷰 `v_rider_credit` 신설 — 라이더 본인·소속 좌상·admin이 조회. 라이더 앱 홈에 **게이지바**(사용/한도, 잔여 강조). POOL 모드면 "좌상 공용 한도"로 표기하고 좌상 총량 기준 게이지를 보여준다(내 몫이 따로 없다는 사실 자체가 정보) |
| **R7** | X2 해소(fail-fast) | 라이더가 계량 제출에서 **POINT를 고르는 순간** 잔여 한도와 이번 건 예상액을 대조해 경고/차단한다. 서버 게이트는 최종 방어선으로 그대로 두되(동시성), **점주가 에러를 보는 일이 없게** 라이더 단에서 먼저 거른다. **예약분(reserved)**: 제출했지만 점주 확인 전인 POINT 건(`status='ARRIVED' ∧ measured_kg 기록됨`)의 예상 지급액을 available에서 뺀다 — 서버 게이트는 COMPLETED 기준이라 이걸 모르므로, 라이더가 연속으로 여러 건을 처리하면 "클라이언트 통과 → 점주 확인에서 서버 거부"로 X2가 재현된다. 재제출은 **자기 건 예약분을 잔여로 되돌려** 이중계산을 막고(폐유 수령액 기준 근사, reserved로 클램프), 제출 성공 직후 크레딧을 재조회한다 |
| **R8** | X1 해소 | `dealer-create`에 `creditLimit`(선택) 추가 — 입력하면 `dealer_accounts` 행을 함께 생성. 미입력 시 현행대로 행 없음(§10 #2 결정 유지)이되 **admin 좌상 목록에 "한도 미설정" 경고 배지**를 띄워 무제한 상태를 가시화한다 |
| **R9** | 권한 | 라이더 개인 한도 쓰기는 **admin + 해당 라이더의 소속 좌상**만(`dealer-rider-limit-set` Edge). `guard_rider_verify` 트리거에 `credit_limit` 보호를 추가해 라이더 셀프 변경을 차단(dealer_id·verify_status와 동일 방식) |

## 3. DB (마이그레이션 1건 + 01-db-schema.sql 동기화)

`20260806000003_dealer_credit_alloc.sql` 1건 — `dealer_alloc_mode`는 **신규 타입**이라 ADD VALUE
제약(같은 트랜잭션 내 사용 불가)이 없다. REFERRAL·WITHDRAW_FEE처럼 파일을 쪼갤 이유가 없어 한 파일에 담는다:
- `create type dealer_alloc_mode as enum ('POOL','PER_RIDER')`
- `dealer_accounts.allocation_mode dealer_alloc_mode not null default 'POOL'`
- `rider_profiles.credit_limit int` (null 허용, `check (credit_limit >= 0)`)
- `guard_rider_verify` 재정의 — `credit_limit`도 service_role만 변경(셀프 insert 시 null 강제,
  셀프 update 시 old 값 복원)
- `v_rider_credit` (**security_invoker=false — 소유자 권한 + 본문 가시성 술어**) — rider_id,
  dealer_id, allocation_mode, limit_amount, used, **reserved**, available, is_unlimited.
  ⚠️ invoker로 두면 안 된다(머지 전 적대적 리뷰 확정): ① 라이더는 `dealer_accounts`를 읽을 수 없어
  (정책이 `dealer_id = auth.uid() or is_admin()`) 조인이 통째로 NULL → 뷰가 is_unlimited=true로
  붕괴하고 게이지·fail-fast가 **조용히 무동작**한다. ② POOL 합산이 라이더 권한에서는 pickup_orders
  RLS에 잘려 본인 주문만 세어 잔여를 과대 표시한다. 따라서 소유자 권한으로 집계하고 가시성은
  `where rp.id = auth.uid() or rp.dealer_id = auth.uid() or is_admin()`로 뷰가 직접 강제한다
- `fn_settle_trade` 개정 — R3의 2단 게이트
- `fn_set_rider_credit_limit(p_rider_id, p_credit_limit, p_actor_id)` service_role RPC
- `fn_set_dealer_account` 개정 — `p_allocation_mode dealer_alloc_mode **default null**` 추가(7파라미터).
  구 6파라미터 시그니처는 삭제하되 **default를 반드시 붙인다** — DEPLOY.md 절차가 `db push` → `functions
  deploy` 순차라, default가 없으면 그 사이 구간에 구 Edge의 6-인자 호출이 어떤 오버로드에도 매칭되지
  않아 500이 난다. 03_privilege_guards_test의 시그니처 단언도 함께 갱신
- 신규 RPC 2종은 `revoke ... from public` + **`revoke execute from anon, authenticated`**까지 수행
  (Supabase `alter default privileges`가 신규 함수에 EXECUTE를 직접 부여 — 20260724000010 락다운과 동일 이유)

pgTAP `21_dealer_credit_alloc_test.sql`: POOL 모드 기존 동작 회귀 / PER_RIDER 미배분 라이더 차단 /
배분 한도 내 통과·초과 거부 / 좌상 총량이 개인 한도보다 작으면 총량이 이긴다 / 정산 청구 후 회복 /
라이더 셀프 credit_limit 변경 차단 / **뷰는 반드시 실제 롤 시점(`set local request.jwt.claims` →
`set local role authenticated`)으로 검증**한다 — superuser 어서션은 뷰의 가시성 술어에 걸려 0행이라
아무것도 증명하지 못하고, invoker 붕괴 같은 결함을 green인 채로 통과시킨다(실제로 그랬다).

## 4. Edge Functions

| 함수 | 권한 | 계약 |
|------|------|------|
| `dealer-rider-limit-set` (신설) | admin + 소속 좌상 | `{ riderId, creditLimit \| null }` → `fn_set_rider_credit_limit`. 소속 아닌 라이더 403 `FORBIDDEN`, 없는 라이더 404 |
| `dealer-account-set` (확장) | admin | 입력에 `allocationMode?: 'POOL'\|'PER_RIDER'` 추가(생략 시 기존 값 유지) |
| `dealer-create` (확장) | admin | 입력에 `creditLimit?: int` 추가 — 있으면 `dealer_accounts` 행 동시 생성(R8) |

## 5. 앱

- **【R】라이더**: 홈 상단에 `CreditGaugeBar`(packages/ui 신설) — "내 포인트 지급 한도" 사용/잔여.
  PER_RIDER면 개인 한도, POOL이면 좌상 공용 한도(라벨로 구분). 계량 제출에서 POINT 선택 시 예상
  지급액 대비 잔여 부족하면 인라인 경고 + 제출 차단(R7). 미소속(본사 직속)·계정 미설정은 게이지
  미노출(한도 없음).
- **【D】좌상 관할 대시보드**: 소속 라이더 행에 한도 배분 입력(PER_RIDER 모드일 때) + 상단에
  "배분 합계 / 총 한도" 요약. POOL 모드면 배분 입력 대신 "총량 공유 중" 안내.
- **【A】admin**: 좌상 목록에 "한도 미설정" 경고 배지(R8), 좌상 생성 폼에 초기 한도 입력,
  정산 화면 계정 패널에 배분 모드 토글.

## 6. 불변 (건드리지 않음)
상태머신·원장 규칙(절대 규칙 1·2)·지급수단 모델(08)·정산 청구 라이프사이클(14 §3)·수수료율·
보증금·추천(09)·쿠폰(17). 이 문서는 크레딧 *소비 게이트*와 *가시성*만 확장한다.

## 7. 태스크 (R)

| # | 내용 | 상태 |
|---|------|------|
| R1 | 스펙 확정(이 문서) + 문서맵 | ✅ |
| R2 | DB 마이그레이션 1건 + pgTAP 21 | ✅ |
| R3 | core 계약 + Edge 3종(신설 1·확장 2) + vendor + config | ✅ |
| R4 | 라이더 게이지바 + POINT fail-fast | ✅ |
| R5 | 좌상 배분 UI + admin 경고·모드 토글 | ✅ |
| R6 | 게이트 + PR | ✅ |
| R7 | **머지 전 적대적 리뷰**(5관점 × 반증 검증, 20 에이전트) — 확정 결함 6건 수정: v_rider_credit invoker 붕괴(핵심)·POOL 과소집계·예약분 미반영·사용액 분모 불일치·RPC default 누락·초기 한도 UI 미연결. 뷰 검증을 실제 롤 시점으로 전환 | ✅ |

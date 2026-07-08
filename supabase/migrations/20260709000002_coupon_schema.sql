-- [07 F2] 마이그레이션 1차 — 수거쿠폰 스키마 (기존 동작 무영향의 순수 추가).
--
-- 신모델 플랫폼 수익원(쿠폰 판매). 절대 규칙 1의 확장: coupon_ledger insert는 service_role RPC
-- (F3a의 fn_charge_coupon/fn_consume_coupon)에만 존재하고, 잔액은 v_coupon_balance 뷰로만 조회한다.
-- 이 파일은 07-pivot-plan.md F2 ①~⑥·⑧ + §1-1·1-2·1-4를 그대로 구현하며, 단일 진실
-- docs/spec/01-db-schema.sql의 [07 F2] 마커 블록과 컬럼/제약/정책 이름 단위로 일치한다.
-- ⑦(verify_status SUSPENDED)은 enum add 트랜잭션 분리 제약 때문에 20260709000001에 분리.
--
-- 무결성 패턴은 기존 선례를 미러링한다:
--   - append-only 트리거·잔액 뷰(security_invoker): point_ledger(01:120-163, 000012 뷰 grant)
--   - GRANT 관례: 20260704000005_grants.sql / 20260704000012_grant_point_balance_view.sql
--   - 함수 search_path 고정: 20260704000014_function_search_path.sql
--   - RLS 정책의 (select auth.uid()) initplan 최적화: 20260704000015_rls_initplan.sql

-- ===== enums (①) =====
create type coupon_entry_type as enum ('CHARGE','CONSUME','REFUND','ADJUST');
-- 쿠폰 구매(PG 결제) 상태 — EXPIRED 포함(orphan PENDING 24h TTL, 07 §1-4).
create type coupon_purchase_status as enum ('PENDING','PAID','FAILED','EXPIRED','REFUNDED');

-- ===== pickup_orders 컬럼 추가 + rider_fee 계열 not null 해제 (⑤·⑥) =====
-- 레거시 행 null 허용. coupon_cost = ceil(requested_kg/KG_PER_CAN) 주문 생성 시 스냅샷(§1-2).
-- cash_paid_amount = round(final_kg × snapshot_price_per_kg) COMPLETED 시 기록.
-- 레거시 완료 시각 조회는 coalesce(completed_at, delivered_at, picked_up_at) 규약(F6/F10 집계 기준).
alter table pickup_orders add column coupon_cost int;
alter table pickup_orders add column cash_paid_amount int;
alter table pickup_orders add column completed_at timestamptz;
-- rider_fee(수거비) 개념 소멸(§1-3): nullable 전환 후 신규 미기록. CHECK(>0)는 NULL을 통과시키므로 유지.
alter table pickup_orders alter column snapshot_rider_fee drop not null;
alter table price_ticks alter column rider_fee drop not null;

-- ===== 쿠폰 단가 tick (③, price_ticks 패턴 미러) =====
-- 전체 read, admin insert, update/delete 정책 없음=정정 불가·신규 tick만.
create table coupon_price_ticks (
  id bigint generated always as identity primary key,
  unit_price int not null check (unit_price > 0),        -- 쿠폰 1장당 가격 (원)
  effective_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index idx_coupon_price_ticks_effective on coupon_price_ticks (effective_at desc);

-- ===== 쿠폰 구매 (④) — PG 결제. 쓰기는 Edge Function(coupon-purchase-intent/confirm)만 =====
create table coupon_purchases (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles(id),
  qty int not null check (qty > 0),
  unit_price int not null check (unit_price > 0),        -- 구매 시점 단가 스냅샷
  amount int not null check (amount > 0),                -- qty × unit_price (원)
  pg_order_id text not null unique,                      -- 토스 주문번호
  payment_key text unique,                               -- 토스 결제키(승인 후 기록) — confirm 멱등 축
  status coupon_purchase_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index idx_coupon_purchases_rider on coupon_purchases (rider_id, created_at desc);

-- ===== 쿠폰 원장 (②, append-only) — point_ledger 3중 무결성 패턴 미러(§1-1) =====
create table coupon_ledger (
  id bigint generated always as identity primary key,
  rider_id uuid not null references profiles(id),
  entry_type coupon_entry_type not null,
  qty int not null check (qty <> 0),                     -- +충전/환급, -소진. not null 필수(CHECK는 NULL 통과 → 생략 금지)
  unit_price int check (entry_type <> 'CHARGE' or unit_price > 0),  -- CHARGE 시 단가 스냅샷 필수
  order_id uuid references pickup_orders(id),            -- CONSUME/REFUND 필수
  purchase_id uuid references coupon_purchases(id),      -- CHARGE 필수, PG환불 ADJUST 시 필수
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- 멱등 ②-1: CONSUME/REFUND 재시도 안전(order 단위). Postgres NULLS DISTINCT 때문에 order_id가
  -- NULL인 행(CHARGE/ADJUST)은 이 제약의 적용 대상이 아니다(다중 충전 허용 — 의도된 동작).
  unique (order_id, entry_type, rider_id)
);
-- 멱등 ②-2: CHARGE/PG환불 멱등(purchase 단위). purchase_id NULL 행 제외(부분 유니크).
create unique index idx_coupon_ledger_purchase on coupon_ledger (purchase_id, entry_type)
  where purchase_id is not null;
create index idx_coupon_ledger_rider on coupon_ledger (rider_id, created_at desc);

-- append-only 강제(forbid_ledger_mutation 복제, search_path 고정). service_role도 UPDATE/DELETE 불가.
create or replace function forbid_coupon_mutation() returns trigger as $$
begin raise exception 'coupon_ledger is append-only'; end;
$$ language plpgsql set search_path = public;
create trigger trg_coupon_no_update before update or delete on coupon_ledger
  for each row execute function forbid_coupon_mutation();

-- ===== 잔액 뷰 (②-③) — point_ledger와 동일하게 security_invoker=true로 호출자 RLS 평가 =====
-- qty 부호를 그대로 누적합(CHARGE/REFUND +, CONSUME −, ADJUST ±).
create view v_coupon_balance
  with (security_invoker = true)
as
select rider_id, coalesce(sum(qty),0)::int as balance
from coupon_ledger group by rider_id;

-- ===== 집계 뷰 2종 (⑧, admin 전용) — security_invoker=true + where is_admin() 게이트 =====
-- 비관리자는 빈 결과(하위 테이블 RLS도 함께 평가). is_admin()은 init(01:285-287)에서 이미 정의됨.
-- 쿠폰 매출: CHARGE 합계 + REFUND(귀책 환급)·PG환불(purchase_id 있는 ADJUST)·수동조정 구분 병기.
create view v_coupon_sales_daily
  with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  coalesce(sum(qty) filter (where entry_type='CHARGE'),0)::int             as charged_qty,
  coalesce(sum(unit_price*qty) filter (where entry_type='CHARGE'),0)::int  as sales_amount,
  coalesce(sum(qty) filter (where entry_type='REFUND'),0)::int            as refund_qty,          -- 귀책 환급(order 단위)
  coalesce(sum(-qty) filter (where entry_type='ADJUST' and purchase_id is not null),0)::int as pg_refund_qty,   -- PG 환불
  coalesce(sum(qty) filter (where entry_type='ADJUST' and purchase_id is null),0)::int      as manual_adjust_qty
from coupon_ledger
where is_admin()
group by 1;

-- 수거 활동 추이: 일별 COMPLETED 건수/final_kg 합/cash_paid_amount 합(completed_at 기준). 쿠폰 매출과 상관 분석용.
create view v_pickup_stats_daily
  with (security_invoker = true)
as
select
  completed_at::date            as day,
  count(*)                      as completed_count,
  coalesce(sum(final_kg),0)     as total_kg,
  coalesce(sum(cash_paid_amount),0)::int as total_cash
from pickup_orders
where status='COMPLETED' and completed_at is not null and is_admin()
group by 1;

-- ===== RLS =====
alter table coupon_price_ticks enable row level security;
alter table coupon_purchases enable row level security;
alter table coupon_ledger enable row level security;

-- coupon_price_ticks: 전체 read, insert admin만 (price_ticks 미러). auth.uid()는 여기서 미사용.
create policy p_coupon_price_read on coupon_price_ticks for select using (true);
create policy p_coupon_price_write on coupon_price_ticks for insert with check (is_admin());
-- coupon_purchases: rider 본인 + admin read. insert/update는 Edge Function(service_role)만 → 정책 없음=차단.
create policy p_coupon_purchase_read on coupon_purchases for select using (rider_id = (select auth.uid()) or is_admin());
-- coupon_ledger: rider 본인 + admin read. insert/update 정책 없음=차단(service_role RPC만). append-only는 트리거로도 강제.
create policy p_coupon_ledger_read on coupon_ledger for select using (rider_id = (select auth.uid()) or is_admin());

-- ===== GRANT (20260704000005·000012 관례 미러) =====
-- service_role: 000005의 alter default privileges가 이후 생성 테이블/시퀀스에 CRUD/usage를
-- 자동 부여하지만, 자족성을 위해 명시적으로도 부여한다.
grant select, insert, update, delete on coupon_price_ticks, coupon_purchases, coupon_ledger to service_role;
grant usage, select on all sequences in schema public to service_role;

-- authenticated: coupon_price_ticks는 price_ticks 미러(admin insert 정책 존재 → select/insert/update +
-- 신규 identity 시퀀스 usage). coupon_purchases·coupon_ledger는 select 정책만 → select만(쓰기는 grant 부재로도 차단).
grant select, insert, update on coupon_price_ticks to authenticated;
grant select on coupon_purchases, coupon_ledger to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- anon: 인증 전 조회 시도만 허용하고 RLS가 걸러낸다(000005 관례). coupon_price_ticks는 public read.
grant select on coupon_price_ticks, coupon_purchases, coupon_ledger to anon;

-- 잔액/집계 뷰: v_point_balance(000012) 선례대로 select GRANT. 집계 뷰는 where is_admin() 게이트로 비관리자 빈 결과.
grant select on v_coupon_balance to authenticated, anon;
grant select on v_coupon_sales_daily to authenticated, anon;
grant select on v_pickup_stats_daily to authenticated, anon;

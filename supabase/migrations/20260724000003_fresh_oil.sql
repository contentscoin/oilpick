-- [14 J2] 신유(새 식용유) 구매·현장 상계 — 데이터 모델. docs/spec/14-fresh-oil-settlement.md §2.
-- 전부 순수 추가(기존 컬럼·정책 불변). order_kind null=레거시=PICKUP(하위호환).

-- ── 주문 종류 enum(신규 타입 — 같은 트랜잭션 내 생성·사용 안전. ADD VALUE와 달리) ──
create type order_kind as enum ('PICKUP', 'PURCHASE', 'MIXED');

-- ── 신유 고시가 tick (price_ticks 패턴 미러: 전체 read, admin insert, 정정불가·신규 tick만) ──
-- 단일 SKU(18L 1종) — 카탈로그 테이블 없음. price_per_can = 18L 1통 판매가(원).
create table fresh_oil_price_ticks (
  id bigint generated always as identity primary key,
  price_per_can int not null check (price_per_can > 0),
  effective_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index idx_fresh_oil_price_ticks_effective on fresh_oil_price_ticks (effective_at desc);

alter table fresh_oil_price_ticks enable row level security;
create policy p_fresh_oil_price_read on fresh_oil_price_ticks for select using (true);
create policy p_fresh_oil_price_write on fresh_oil_price_ticks for insert with check (is_admin());

grant select on fresh_oil_price_ticks to anon, authenticated;
grant select, insert on fresh_oil_price_ticks to service_role;

-- 현재 시세(usePriceTicks 패턴)와 동일하게 Realtime로 최신 tick을 앱에 밀어준다.
alter publication supabase_realtime add table fresh_oil_price_ticks;

-- ── pickup_orders 확장(신유 구매·상계 필드) ──
-- order_kind: null=레거시=PICKUP. purchase_*: 신청 시점 스냅샷(신유 tick). delivered_*/purchase_amount/
-- net_amount: 현장 확정(SUBMIT_MEASURE/CONFIRM에서 기록). cash_paid_amount 의미는 동결(폐유 총액).
alter table pickup_orders add column order_kind order_kind;                   -- null=PICKUP(레거시)
alter table pickup_orders add column purchase_requested_cans int;             -- 신청 신유 통수(1..50)
alter table pickup_orders add column snapshot_fresh_can_price int;            -- 신청 시점 신유 통당가 스냅샷
alter table pickup_orders add column delivered_cans int;                      -- 현장 실배달 통수(0..50)
alter table pickup_orders add column purchase_amount int;                     -- delivered_cans × snapshot_fresh_can_price
alter table pickup_orders add column net_amount int;                          -- 폐유 총액 − 신유 대금(음수 가능)

-- purchase_requested_cans ↔ snapshot_fresh_can_price는 동반(둘 다 null이거나 둘 다 값).
alter table pickup_orders add constraint chk_purchase_snapshot_paired
  check ((purchase_requested_cans is null) = (snapshot_fresh_can_price is null));
-- 범위 가드(값이 있을 때만).
alter table pickup_orders add constraint chk_purchase_requested_cans_range
  check (purchase_requested_cans is null or (purchase_requested_cans between 1 and 50));
alter table pickup_orders add constraint chk_snapshot_fresh_can_price_pos
  check (snapshot_fresh_can_price is null or snapshot_fresh_can_price > 0);
alter table pickup_orders add constraint chk_delivered_cans_range
  check (delivered_cans is null or (delivered_cans between 0 and 50));

-- [14 J3] 좌상 정산 체인 — 스키마. docs/spec/14-fresh-oil-settlement.md §4. 13 D5를 supersede.
-- 순수 추가(기존 정책 재정의는 좌상 주문 읽기 1건 — 라이브조인→스냅샷). 좌상 크레딧=보증금 담보
-- B2B 외상채권(선불수단 아님, §0). 정산 청구 라이프사이클·게이트는 20260724000007에서 RPC로.

create type dealer_settlement_status as enum ('CLAIMED', 'SETTLED', 'VOID');

-- ── 좌상 계정(보증금·한도·임계·요율) ──────────────────────────────────────
-- credit_limit은 계약별 수기 입력(레버리지 비율 하드코딩 안 함 — UI가 ×1.4 프리필만). fee_rate_bp
-- 초기 0(요율 확정 없이 구조 완성). 쓰기는 service_role RPC(dealer-account-set Edge)만.
create table dealer_accounts (
  dealer_id uuid primary key references profiles(id),
  deposit_amount int not null default 0 check (deposit_amount >= 0),   -- 보증금(원)
  credit_limit int not null default 0 check (credit_limit >= 0),       -- 사용한도(P)
  claim_threshold int not null default 5000000 check (claim_threshold > 0), -- 자동청구 배지 임계(P)
  fee_rate_bp int not null default 0 check (fee_rate_bp >= 0 and fee_rate_bp <= 10000), -- 요율(bp)
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
alter table dealer_accounts enable row level security;
create policy p_dealer_accounts_read on dealer_accounts for select
  using (dealer_id = (select auth.uid()) or is_admin());
grant select on dealer_accounts to authenticated;
grant select, insert, update on dealer_accounts to service_role;

-- ── 좌상 정산 청구(원장) ───────────────────────────────────────────────────
-- 주문 귀속은 pickup_orders.dealer_settlement_id 스탬핑(날짜범위 아님) → "정산=윈도우 리셋" 원자적.
create table dealer_settlements (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references profiles(id),
  status dealer_settlement_status not null default 'CLAIMED',
  point_minted int not null default 0,   -- Σ(net>0, POINT) = 점주 수령 = 회사→좌상 청구분
  point_spent int not null default 0,    -- Σ(-net for net<0, POINT) = 점주 지불 = 청구 상쇄분
  fee_amount int not null default 0,     -- round(Σcash_paid_amount × fee_rate_bp / 10000)
  net_due int not null default 0,        -- point_minted − point_spent + fee_amount(음수=회사→좌상 지급)
  period_start timestamptz,
  period_end timestamptz,
  claimed_at timestamptz not null default now(),
  claimed_by uuid references profiles(id),
  settled_at timestamptz,
  settled_by uuid references profiles(id),
  voided_at timestamptz,
  voided_by uuid references profiles(id)
);
create index idx_dealer_settlements_dealer on dealer_settlements (dealer_id, claimed_at desc);
alter table dealer_settlements enable row level security;
create policy p_dealer_settlements_read on dealer_settlements for select
  using (dealer_id = (select auth.uid()) or is_admin());
grant select on dealer_settlements to authenticated;
grant select, insert, update on dealer_settlements to service_role;

-- ── pickup_orders 귀속 컬럼(스냅샷 dealer_id + 정산 스탬프) ─────────────────
alter table pickup_orders add column dealer_id uuid references profiles(id);           -- ACCEPT 시 스냅샷. null=본사 직속
alter table pickup_orders add column dealer_settlement_id uuid references dealer_settlements(id); -- 청구 귀속. null=미정산
-- 미정산 청구 대상 부분 인덱스(청구 집계·게이트 usage 조회 가속).
create index idx_orders_dealer_unsettled on pickup_orders (dealer_id)
  where status = 'COMPLETED' and dealer_settlement_id is null;

-- ── dealer_id ACCEPT 스냅샷 트리거(라이더 재배정이 과거 채무 귀속을 바꾸지 않게 시점 고정) ──
-- fn_transition_order를 재정의하지 않고 BEFORE UPDATE 트리거로 처리(ACCEPT의 update가 status를
-- ACCEPTED로 바꿀 때 rider의 당시 소속 좌상을 스냅샷). §2-6.
create or replace function fn_snapshot_dealer_on_accept() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if new.status = 'ACCEPTED' and old.status is distinct from 'ACCEPTED' and new.rider_id is not null then
    new.dealer_id := (select dealer_id from rider_profiles where id = new.rider_id);
  end if;
  return new;
end;
$$;
create trigger trg_snapshot_dealer_on_accept before update on pickup_orders
  for each row execute function fn_snapshot_dealer_on_accept();

-- ── RLS 재정의: 좌상 주문 읽기 = 스냅샷 기준(라이브조인 폐기) ────────────────
-- 기존 p_orders_read_by_dealer(rider_profiles.dealer_id 현재값 라이브조인)는 재배정 시 새 좌상에게
-- 과거 주문 재무정보+점주 PII를 누출한다 → 스냅샷(dealer_id) 기준으로 교체. §2-6·보안.
drop policy if exists p_orders_read_by_dealer on pickup_orders;
create policy p_orders_read_by_dealer on pickup_orders for select
  using (dealer_id = (select auth.uid()));

-- ── 뷰: 좌상 명세(usage/limit/headroom/over_threshold, 본사 행 제외) ─────────
-- security_invoker → 좌상은 자기 주문·계정만(RLS), admin은 전체. usage = 미정산 POINT net 합(minted−spent).
create view v_dealer_statement with (security_invoker = true) as
select
  d.id                                                                      as dealer_id,
  da.deposit_amount,
  da.credit_limit,
  da.claim_threshold,
  da.fee_rate_bp,
  coalesce(u.point_minted, 0)                                               as point_minted,
  coalesce(u.point_spent, 0)                                                as point_spent,
  coalesce(u.point_minted, 0) - coalesce(u.point_spent, 0)                  as usage,
  da.credit_limit - (coalesce(u.point_minted, 0) - coalesce(u.point_spent, 0)) as headroom,
  (coalesce(u.point_minted, 0) - coalesce(u.point_spent, 0)) >= da.claim_threshold as over_threshold,
  coalesce(u.unsettled_order_count, 0)                                      as unsettled_order_count,
  coalesce(u.unsettled_gross, 0)                                            as unsettled_gross
from profiles d
join dealer_accounts da on da.dealer_id = d.id
left join (
  select
    dealer_id,
    sum(case when payout_method = 'POINT' and net_amount > 0 then net_amount else 0 end)::int as point_minted,
    sum(case when payout_method = 'POINT' and net_amount < 0 then -net_amount else 0 end)::int as point_spent,
    sum(coalesce(cash_paid_amount, 0))::int                                                   as unsettled_gross,
    count(*)::int                                                                             as unsettled_order_count
  from pickup_orders
  where status = 'COMPLETED' and dealer_settlement_id is null and dealer_id is not null
  group by dealer_id
) u on u.dealer_id = d.id
where d.role = 'dealer';
grant select on v_dealer_statement to authenticated;

-- ── 뷰: 정산 대상/상세 주문(청구 상세·CSV) ──────────────────────────────────
create view v_dealer_settlement_orders with (security_invoker = true) as
select
  o.id                as order_id,
  o.dealer_id,
  o.dealer_settlement_id,
  o.status,
  o.payout_method,
  o.cash_paid_amount,
  o.purchase_amount,
  o.net_amount,
  o.completed_at
from pickup_orders o
where o.dealer_id is not null and o.status = 'COMPLETED';
grant select on v_dealer_settlement_orders to authenticated;

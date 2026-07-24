-- [14 J3] 좌상 정산 체인 — RPC. docs/spec/14-fresh-oil-settlement.md §4.
--   ① fn_settle_trade 재정의: POINT & net>0 EARN 전에 좌상 크레딧 게이트 추가(advisory lock).
--      본사 직속(dealer_id null)은 무게이트. fn_transition_order는 무변경(헬퍼만 교체).
--   ② 청구 라이프사이클 RPC 3종(service_role): 생성(집계·스탬핑)·정산 마킹·무효(스탬프 해제).

-- ===================== ① fn_settle_trade (크레딧 게이트 반영 재정의) =====================
create or replace function fn_settle_trade(
  p_order_id uuid,
  p_actor_id uuid,
  p_source text
) returns pickup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pickup_orders;
  v_final_kg numeric(8,1);
  v_waste int;
  v_purchase int;
  v_net int;
  v_available int;
  v_credit_limit int;
  v_usage int;
begin
  select * into v_order from pickup_orders where id = p_order_id for update;

  v_final_kg := coalesce(v_order.final_kg, v_order.measured_kg);
  if v_final_kg is null then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  v_waste := round(v_final_kg * v_order.snapshot_price_per_kg)::int;
  v_purchase := coalesce(v_order.delivered_cans, 0) * coalesce(v_order.snapshot_fresh_can_price, 0);
  v_net := v_waste - v_purchase;

  if v_waste = 0 and v_purchase = 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  update pickup_orders
  set status = 'COMPLETED',
      final_kg = v_final_kg,
      cash_paid_amount = v_waste,
      purchase_amount = v_purchase,
      net_amount = v_net,
      completed_at = now()
  where id = p_order_id
  returning * into v_order;

  if coalesce(v_order.payout_method, 'CASH') = 'POINT' then
    if v_net > 0 then
      -- [14 J3] 좌상 크레딧 게이트: 미정산 사용액(방금 COMPLETED된 이 주문 포함)이 한도 초과면 거부.
      -- advisory xact lock으로 동시 CONFIRM 직렬화(READ COMMITTED에서 상대 커밋을 반영). 본사 직속 무게이트.
      if v_order.dealer_id is not null then
        perform pg_advisory_xact_lock(hashtext('dealer_credit:' || v_order.dealer_id::text));
        select credit_limit into v_credit_limit from dealer_accounts where dealer_id = v_order.dealer_id;
        if v_credit_limit is not null then
          select coalesce(sum(case when payout_method = 'POINT' then net_amount else 0 end), 0)::int
          into v_usage
          from pickup_orders
          where dealer_id = v_order.dealer_id and status = 'COMPLETED' and dealer_settlement_id is null;
          if v_usage > v_credit_limit then
            raise exception 'DEALER_LIMIT_EXCEEDED' using errcode = 'P0001';
          end if;
        end if;
      end if;
      perform fn_post_ledger(v_order.supplier_id, 'EARN', v_net, p_order_id, p_source, p_actor_id, null);
    elsif v_net < 0 then
      -- 점주 지불(−) → TRADE_PURCHASE 차감. 출금과 동일 직렬화+잔액검사(음수 잔액 금지).
      perform 1 from point_ledger where user_id = v_order.supplier_id for update;
      select coalesce(sum(case
        when entry_type = 'HOLD' then 0
        when entry_type = 'RELEASE' then amount
        else amount end), 0)::int
      into v_available
      from point_ledger
      where user_id = v_order.supplier_id;
      if v_available < (-v_net) then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      perform fn_post_ledger(v_order.supplier_id, 'TRADE_PURCHASE', v_net, p_order_id, p_source, p_actor_id, null);
    end if;
  end if;

  return v_order;
end;
$$;

revoke all on function fn_settle_trade(uuid, uuid, text) from public;
grant execute on function fn_settle_trade(uuid, uuid, text) to service_role;

-- ===================== ② 청구 라이프사이클 RPC =====================

-- fn_create_dealer_claim: 미정산 주문 집계 → dealer_settlements insert → 대상 주문 스탬핑.
-- advisory lock으로 게이트와 직렬화. 대상 없으면 NOT_FOUND. fee = round(Σcash_paid_amount×bp/10000).
create or replace function fn_create_dealer_claim(
  p_dealer_id uuid,
  p_admin_id uuid
) returns dealer_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minted int;
  v_spent int;
  v_gross int;
  v_count int;
  v_start timestamptz;
  v_end timestamptz;
  v_fee_bp int;
  v_fee int;
  v_net_due int;
  v_settlement dealer_settlements;
begin
  perform pg_advisory_xact_lock(hashtext('dealer_credit:' || p_dealer_id::text));

  select
    coalesce(sum(case when payout_method = 'POINT' and net_amount > 0 then net_amount else 0 end), 0)::int,
    coalesce(sum(case when payout_method = 'POINT' and net_amount < 0 then -net_amount else 0 end), 0)::int,
    coalesce(sum(coalesce(cash_paid_amount, 0)), 0)::int,
    count(*)::int,
    min(completed_at),
    max(completed_at)
  into v_minted, v_spent, v_gross, v_count, v_start, v_end
  from pickup_orders
  where dealer_id = p_dealer_id and status = 'COMPLETED' and dealer_settlement_id is null;

  if v_count = 0 then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select fee_rate_bp into v_fee_bp from dealer_accounts where dealer_id = p_dealer_id;
  v_fee := round(v_gross * coalesce(v_fee_bp, 0) / 10000.0)::int;
  v_net_due := v_minted - v_spent + v_fee;

  insert into dealer_settlements
    (dealer_id, status, point_minted, point_spent, fee_amount, net_due, period_start, period_end, claimed_by)
  values
    (p_dealer_id, 'CLAIMED', v_minted, v_spent, v_fee, v_net_due, v_start, v_end, p_admin_id)
  returning * into v_settlement;

  -- 스탬핑: 대상 주문에 settlement_id 부여(윈도우에서 제거 — 다음 청구·게이트에서 제외).
  update pickup_orders set dealer_settlement_id = v_settlement.id
  where dealer_id = p_dealer_id and status = 'COMPLETED' and dealer_settlement_id is null;

  return v_settlement;
end;
$$;

revoke all on function fn_create_dealer_claim(uuid, uuid) from public;
grant execute on function fn_create_dealer_claim(uuid, uuid) to service_role;

-- fn_settle_dealer_claim: CLAIMED→SETTLED 멱등 마킹(referral 패턴). VOID는 정산 불가.
create or replace function fn_settle_dealer_claim(
  p_settlement_id uuid,
  p_admin_id uuid
) returns dealer_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dealer_settlements;
begin
  select * into v_row from dealer_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_row.status = 'SETTLED' then
    return v_row; -- 멱등
  end if;
  if v_row.status <> 'CLAIMED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update dealer_settlements
  set status = 'SETTLED', settled_at = now(), settled_by = p_admin_id
  where id = p_settlement_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function fn_settle_dealer_claim(uuid, uuid) from public;
grant execute on function fn_settle_dealer_claim(uuid, uuid) to service_role;

-- fn_void_dealer_claim: CLAIMED→VOID(스탬프 해제 → 주문 풀 복귀). SETTLED는 무효화 불가.
create or replace function fn_void_dealer_claim(
  p_settlement_id uuid,
  p_admin_id uuid
) returns dealer_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dealer_settlements;
begin
  select * into v_row from dealer_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_row.status <> 'CLAIMED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  -- 스탬프 해제: 이 청구에 귀속됐던 주문을 미정산 풀로 되돌린다.
  update pickup_orders set dealer_settlement_id = null where dealer_settlement_id = p_settlement_id;
  update dealer_settlements
  set status = 'VOID', voided_at = now(), voided_by = p_admin_id
  where id = p_settlement_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function fn_void_dealer_claim(uuid, uuid) from public;
grant execute on function fn_void_dealer_claim(uuid, uuid) to service_role;

-- fn_set_dealer_account: 좌상 계정 upsert(보증금·한도·임계·요율). service_role(dealer-account-set Edge)만.
create or replace function fn_set_dealer_account(
  p_dealer_id uuid,
  p_deposit_amount int,
  p_credit_limit int,
  p_claim_threshold int,
  p_fee_rate_bp int,
  p_admin_id uuid
) returns dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dealer_accounts;
begin
  -- 대상이 실제 좌상(role='dealer')인지 검증.
  if not exists (select 1 from profiles where id = p_dealer_id and role = 'dealer') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into dealer_accounts (dealer_id, deposit_amount, credit_limit, claim_threshold, fee_rate_bp, updated_by)
  values (p_dealer_id, p_deposit_amount, p_credit_limit, p_claim_threshold, p_fee_rate_bp, p_admin_id)
  on conflict (dealer_id) do update
    set deposit_amount = excluded.deposit_amount,
        credit_limit = excluded.credit_limit,
        claim_threshold = excluded.claim_threshold,
        fee_rate_bp = excluded.fee_rate_bp,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function fn_set_dealer_account(uuid, int, int, int, int, uuid) from public;
grant execute on function fn_set_dealer_account(uuid, int, int, int, int, uuid) to service_role;

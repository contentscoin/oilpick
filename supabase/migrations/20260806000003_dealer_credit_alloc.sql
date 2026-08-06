-- [18 R2] 좌상 크레딧 공유·배분 + 라이더 가시성. docs/spec/18-dealer-credit-share.md.
-- 14 크레딧(C5) 위 순수 추가 — 기존 좌상은 allocation_mode 기본값 'POOL'이라 동작 무변경.
--   ① dealer_accounts.allocation_mode (POOL 총량공유 / PER_RIDER 라이더별 배분)
--   ② rider_profiles.credit_limit (PER_RIDER 모드의 라이더 개인 한도. null=미배분=0)
--   ③ guard_rider_verify 확장 — credit_limit도 service_role만 변경(라이더 셀프 위조 차단, R9)
--   ④ v_rider_credit — 라이더 본인·소속 좌상·admin이 보는 한도/사용/잔여(게이지바 소스, R6)
--   ⑤ fn_settle_trade 2단 게이트 — 좌상 총량(기존) → PER_RIDER면 라이더 개인 한도(R3)
--   ⑥ fn_set_rider_credit_limit / fn_set_dealer_account(모드 파라미터) service_role RPC

-- ── ① 배분 모드 ──────────────────────────────────────────────────────────
-- 신규 타입이라 ADD VALUE 제약(트랜잭션 내 사용 불가)이 없어 같은 파일에서 바로 쓸 수 있다.
do $$ begin
  create type dealer_alloc_mode as enum ('POOL','PER_RIDER');
exception when duplicate_object then null;
end $$;

alter table dealer_accounts
  add column if not exists allocation_mode dealer_alloc_mode not null default 'POOL';

-- ── ② 라이더 개인 한도 ───────────────────────────────────────────────────
-- null = 미배분. PER_RIDER 모드에서 null은 "0으로 취급"(명시 배분한 라이더만 POINT 지급 가능, R2).
-- POOL 모드에서는 이 값을 무시한다.
alter table rider_profiles
  add column if not exists credit_limit int check (credit_limit is null or credit_limit >= 0);

-- ── ③ 권한가드 확장 ─────────────────────────────────────────────────────
-- 20260722000002 guard_rider_verify를 verify_status·reject_reason·dealer_id + credit_limit 보호로 재정의.
-- 라이더가 자기 한도를 올려 무한 지급하는 경로를 원천 차단한다(배정·한도는 Edge/service_role만).
create or replace function guard_rider_verify() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verify_status := 'PENDING';
    new.reject_reason := null;
    new.dealer_id := null;              -- 셀프 가입 시 소속 자기설정 차단
    new.credit_limit := null;           -- [18 R9] 셀프 가입 시 한도 자기설정 차단
  else
    new.verify_status := old.verify_status;
    new.reject_reason := old.reject_reason;
    new.dealer_id := old.dealer_id;     -- 소속 자기변경 차단(배정은 Edge로만)
    new.credit_limit := old.credit_limit; -- [18 R9] 한도 자기변경 차단(배분은 Edge로만)
  end if;
  return new;
end;
$$;

-- ── ④ 라이더 크레딧 뷰 ───────────────────────────────────────────────────
-- ⚠️ **security_invoker를 쓰면 안 된다**(리뷰 확정 결함). 이 뷰는 두 테이블을 조인하는데:
--   ① dealer_accounts의 유일한 SELECT 정책은 `dealer_id = auth.uid() or is_admin()`이라
--      **라이더에게는 자기 좌상의 계정 행이 보이지 않는다** → left join이 통째로 NULL이 되어
--      limit_amount=null·is_unlimited=true로 붕괴하고, 게이지바와 POINT fail-fast(R6·R7)가
--      에러 하나 없이 조용히 무동작한다.
--   ② POOL 모드의 pool 합산은 **좌상 전체** 주문을 세야 하는데, 라이더 권한으로 평가되면
--      pickup_orders RLS가 본인 주문만 남겨 사용액을 과소 집계한다(잔여 과대 표시).
-- 따라서 뷰 소유자 권한(security_invoker=false, PG 기본)으로 집계하고 **가시성은 뷰 본문의
-- 명시적 술어로 직접 강제**한다 — 라이더 본인 / 소속 좌상 / admin만 자기 범위의 행을 본다.
-- (dealer_accounts에 라이더용 정책을 추가하는 대안은 보증금·수수료율까지 노출되어 기각.)
--
-- used = 미정산 POINT 지급 순액(14 §2-5 좌상 총량과 **같은 분모** — R4). 음수(신유 구매 상계)도
-- 그대로 반영해 개인 한도가 회복되게 한다. 정산 청구가 스탬핑되면 합계에서 빠져 한도가 회복된다.
-- reserved = 제출했지만 아직 점주 확인 전인 POINT 건의 예상 지급액(status='ARRIVED' +
-- measured_kg 기록됨). 서버 게이트는 COMPLETED 기준이라 이 예약분을 모르지만, 라이더가 연속으로
-- 여러 건을 처리하면 "클라이언트는 통과 → 점주 확인에서 서버가 거부"가 되어 X2가 재현된다.
-- UI 차단을 보수적으로 만들기 위해 available에서 예약분을 뺀다(서버 게이트는 무변경).
-- POOL 모드: limit_amount/used는 좌상 총량 기준(내 몫이 따로 없음을 라벨로 구분해 표시, R6).
-- 계정 행이 없는 좌상(X1)·본사 직속(dealer_id null)은 is_unlimited=true — 게이지 미노출 신호.
create or replace view v_rider_credit with (security_invoker = false) as
select
  rp.id                                        as rider_id,
  rp.dealer_id,
  da.allocation_mode,
  -- 개인 한도(PER_RIDER) / 좌상 총량(POOL). 계정 없으면 null.
  case
    when da.dealer_id is null then null
    when da.allocation_mode = 'PER_RIDER' then coalesce(rp.credit_limit, 0)
    else da.credit_limit
  end                                          as limit_amount,
  case
    when da.dealer_id is null then 0
    when da.allocation_mode = 'PER_RIDER' then coalesce(mine.used, 0)
    else coalesce(pool.used, 0)
  end                                          as used,
  case
    when da.dealer_id is null then 0
    when da.allocation_mode = 'PER_RIDER' then coalesce(mine.reserved, 0)
    else coalesce(pool.reserved, 0)
  end                                          as reserved,
  greatest(
    case
      when da.dealer_id is null then 0
      when da.allocation_mode = 'PER_RIDER'
        then coalesce(rp.credit_limit, 0) - coalesce(mine.used, 0) - coalesce(mine.reserved, 0)
      else da.credit_limit - coalesce(pool.used, 0) - coalesce(pool.reserved, 0)
    end, 0)                                    as available,
  (da.dealer_id is null)                       as is_unlimited
from rider_profiles rp
left join dealer_accounts da on da.dealer_id = rp.dealer_id
left join lateral (
  select
    coalesce(sum(o.net_amount) filter (where o.status = 'COMPLETED'), 0)::int as used,
    -- kg는 fn_settle_trade와 **같은 식**(coalesce(final_kg, measured_kg))을 써야 한다. 중재
    -- (RESOLVE_DISPUTE)는 status를 ARRIVED로 되돌리며 final_kg를 기록하지만 measured_kg는 그대로
    -- 두므로, measured_kg만 보면 실제 지급액과 어긋난 금액을 예약하게 된다.
    coalesce(sum(greatest(
      round(coalesce(o.final_kg, o.measured_kg) * o.snapshot_price_per_kg)::int
        - coalesce(o.delivered_cans, 0) * coalesce(o.snapshot_fresh_can_price, 0), 0
    )) filter (where o.status = 'ARRIVED' and coalesce(o.final_kg, o.measured_kg) is not null), 0)::int as reserved
  from pickup_orders o
  where o.rider_id = rp.id
    and o.dealer_id = rp.dealer_id
    and o.dealer_settlement_id is null
    and o.payout_method = 'POINT'
    and (o.status = 'COMPLETED' or (o.status = 'ARRIVED' and coalesce(o.final_kg, o.measured_kg) is not null))
) mine on true
left join lateral (
  select
    coalesce(sum(o.net_amount) filter (where o.status = 'COMPLETED'), 0)::int as used,
    -- kg는 fn_settle_trade와 **같은 식**(coalesce(final_kg, measured_kg))을 써야 한다. 중재
    -- (RESOLVE_DISPUTE)는 status를 ARRIVED로 되돌리며 final_kg를 기록하지만 measured_kg는 그대로
    -- 두므로, measured_kg만 보면 실제 지급액과 어긋난 금액을 예약하게 된다.
    coalesce(sum(greatest(
      round(coalesce(o.final_kg, o.measured_kg) * o.snapshot_price_per_kg)::int
        - coalesce(o.delivered_cans, 0) * coalesce(o.snapshot_fresh_can_price, 0), 0
    )) filter (where o.status = 'ARRIVED' and coalesce(o.final_kg, o.measured_kg) is not null), 0)::int as reserved
  from pickup_orders o
  where o.dealer_id = rp.dealer_id
    and o.dealer_settlement_id is null
    and o.payout_method = 'POINT'
    and (o.status = 'COMPLETED' or (o.status = 'ARRIVED' and coalesce(o.final_kg, o.measured_kg) is not null))
) pool on true
-- 가시성(뷰가 소유자 권한으로 도므로 여기서 직접 강제한다 — RLS 대체가 아니라 등가 표현).
where rp.id = (select auth.uid())
   or rp.dealer_id = (select auth.uid())
   or is_admin();

grant select on v_rider_credit to authenticated;

-- ── ⑤ fn_settle_trade — 2단 게이트 재정의 ────────────────────────────────
-- 20260724000007 정의를 그대로 두고 POINT·net>0 분기의 크레딧 게이트만 확장한다.
-- ① 좌상 총량: 모드와 무관하게 항상 검사(배분 합계가 총량을 넘겨도 총량이 최종 방어선, R5).
-- ② PER_RIDER: 라이더 개인 한도 추가 검사 → 초과 시 RIDER_LIMIT_EXCEEDED.
-- 두 검사 모두 같은 advisory xact lock(좌상 단위) 안에서 수행해 동시 CONFIRM을 직렬화한다.
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
  v_alloc_mode dealer_alloc_mode;
  v_rider_limit int;
  v_rider_usage int;
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
      -- [14 J3 / 18 R3] 좌상 크레딧 2단 게이트. 본사 직속(dealer_id null)은 무게이트.
      if v_order.dealer_id is not null then
        perform pg_advisory_xact_lock(hashtext('dealer_credit:' || v_order.dealer_id::text));
        select credit_limit, allocation_mode
        into v_credit_limit, v_alloc_mode
        from dealer_accounts where dealer_id = v_order.dealer_id;

        -- ① 좌상 총량(기존 동작 — 계정 행이 없으면 게이트 미적용, 14 §10 #2).
        if v_credit_limit is not null then
          select coalesce(sum(case when payout_method = 'POINT' then net_amount else 0 end), 0)::int
          into v_usage
          from pickup_orders
          where dealer_id = v_order.dealer_id and status = 'COMPLETED' and dealer_settlement_id is null;
          if v_usage > v_credit_limit then
            raise exception 'DEALER_LIMIT_EXCEEDED' using errcode = 'P0001';
          end if;

          -- ② [18 R3] PER_RIDER 모드: 라이더 개인 한도. 미배분(null)은 0으로 취급 → 전량 거부.
          if v_alloc_mode = 'PER_RIDER' then
            select coalesce(credit_limit, 0) into v_rider_limit
            from rider_profiles where id = v_order.rider_id;
            -- 라이더 사용액도 좌상 총량과 **같은 분모**(순액 — 음수 상계 포함, R4). net>0만 세면
            -- 신유 구매로 좌상 채무를 되돌린 라이더가 개인 한도만 계속 소진해 부당하게 잠긴다.
            select coalesce(sum(net_amount), 0)::int
            into v_rider_usage
            from pickup_orders
            where rider_id = v_order.rider_id
              and dealer_id = v_order.dealer_id
              and status = 'COMPLETED'
              and dealer_settlement_id is null
              and payout_method = 'POINT';
            if v_rider_usage > coalesce(v_rider_limit, 0) then
              raise exception 'RIDER_LIMIT_EXCEEDED' using errcode = 'P0001';
            end if;
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

-- ── ⑥ 배분 RPC ──────────────────────────────────────────────────────────
-- 라이더 개인 한도 설정. 소유권 검증(admin | 소속 좌상)은 Edge가 수행하고, 여기서는 라이더 존재만
-- 확인한다(fn_set_dealer_account와 동일 분업 — 14 §4).
create or replace function fn_set_rider_credit_limit(
  p_rider_id uuid,
  p_credit_limit int,
  p_actor_id uuid
) returns rider_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row rider_profiles;
begin
  if p_credit_limit is not null and p_credit_limit < 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  update rider_profiles
  set credit_limit = p_credit_limit
  where id = p_rider_id
  returning * into v_row;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- anon/authenticated 직접 GRANT까지 회수(20260724000010 락다운과 동일 이유 — Supabase의
-- alter default privileges가 신규 함수에 EXECUTE를 직접 붙인다. revoke from public만으로는 부족).
revoke all on function fn_set_rider_credit_limit(uuid, int, uuid) from public;
revoke execute on function fn_set_rider_credit_limit(uuid, int, uuid) from anon, authenticated;
grant execute on function fn_set_rider_credit_limit(uuid, int, uuid) to service_role;

-- 좌상 계정 upsert에 배분 모드 추가. 구 6파라미터 시그니처는 **삭제**한다 — 남겨두면 PostgREST가
-- 이름 기반 오버로드 해석에서 모호해질 수 있고, 호출부는 Edge 하나뿐이라 동시 배포로 안전하다.
-- 모드 생략(null) 시 기존 값 유지, 신규 행은 'POOL'.
drop function if exists fn_set_dealer_account(uuid, int, int, int, int, uuid);

create or replace function fn_set_dealer_account(
  p_dealer_id uuid,
  p_deposit_amount int,
  p_credit_limit int,
  p_claim_threshold int,
  p_fee_rate_bp int,
  p_admin_id uuid,
  -- default null: `db push`가 먼저 적용되고 `functions deploy`가 뒤따르는 배포 창(DEPLOY.md 1장)에서
  -- 구 Edge의 6-인자 호출이 그대로 이 함수로 해석되게 한다. default가 없으면 그 구간에 500이 난다.
  p_allocation_mode dealer_alloc_mode default null
) returns dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dealer_accounts;
begin
  -- 대상이 실제 좌상(role='dealer')인지 검증(구 정의와 동일 errcode 유지).
  if not exists (select 1 from profiles where id = p_dealer_id and role = 'dealer') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into dealer_accounts (
    dealer_id, deposit_amount, credit_limit, claim_threshold, fee_rate_bp, allocation_mode, updated_by
  )
  values (
    p_dealer_id, p_deposit_amount, p_credit_limit, p_claim_threshold, p_fee_rate_bp,
    coalesce(p_allocation_mode, 'POOL'), p_admin_id
  )
  on conflict (dealer_id) do update
    set deposit_amount = excluded.deposit_amount,
        credit_limit = excluded.credit_limit,
        claim_threshold = excluded.claim_threshold,
        fee_rate_bp = excluded.fee_rate_bp,
        allocation_mode = coalesce(p_allocation_mode, dealer_accounts.allocation_mode),
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function fn_set_dealer_account(uuid, int, int, int, int, uuid, dealer_alloc_mode) from public;
revoke execute on function fn_set_dealer_account(uuid, int, int, int, int, uuid, dealer_alloc_mode) from anon, authenticated;
grant execute on function fn_set_dealer_account(uuid, int, int, int, int, uuid, dealer_alloc_mode) to service_role;

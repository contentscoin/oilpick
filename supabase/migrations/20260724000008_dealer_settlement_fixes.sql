-- [14 J4] 좌상 정산 적대적 리뷰 반영. docs/spec/14-fresh-oil-settlement.md §4.
--   ① fn_create_dealer_claim 원자화(리뷰 #1): 집계와 스탬핑을 "UPDATE ... RETURNING" 한 문장으로 묶어
--      집계 대상 = 스탬프 대상이 되도록 한다. 종전엔 집계 SELECT와 스탬프 UPDATE가 별개 문장이라,
--      그 사이에 동시 완료(net<0/net=0/CASH — 크레딧 게이트의 advisory lock을 타지 않는 경로)가 커밋되면
--      스탬프는 되지만 집계에서 누락돼(READ COMMITTED 스냅샷 차이) point_minted/spent·net_due가 어긋나고
--      해당 주문이 장부에서 유실됐다.
--   ② v_dealer_rider_stats.point_paid 정정(리뷰 #4): POINT 실지급액은 minted(net>0)이다. cash_paid_amount는
--      J2에서 폐유 총액으로 동결됐으므로 MIXED POINT 주문에서 신유 상계분만큼 과다 계상된다. net 기준으로 교정
--      (레거시=net_amount null은 cash_paid_amount 폴백 — 상계 없음이라 동일).

-- ① 원자적 청구 생성 ---------------------------------------------------------
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

  -- 청구 셸을 먼저 만들고(id 확보), 스탬핑+집계를 단일 데이터변경 CTE로 원자화한다.
  insert into dealer_settlements (dealer_id, status, claimed_by)
  values (p_dealer_id, 'CLAIMED', p_admin_id)
  returning * into v_settlement;

  with stamped as (
    update pickup_orders
    set dealer_settlement_id = v_settlement.id
    where dealer_id = p_dealer_id and status = 'COMPLETED' and dealer_settlement_id is null
    returning payout_method, net_amount, cash_paid_amount, completed_at
  )
  select
    coalesce(sum(case when payout_method = 'POINT' and net_amount > 0 then net_amount else 0 end), 0)::int,
    coalesce(sum(case when payout_method = 'POINT' and net_amount < 0 then -net_amount else 0 end), 0)::int,
    coalesce(sum(coalesce(cash_paid_amount, 0)), 0)::int,
    count(*)::int,
    min(completed_at),
    max(completed_at)
  into v_minted, v_spent, v_gross, v_count, v_start, v_end
  from stamped;

  if v_count = 0 then
    -- 대상 없음: insert + (0건) stamp 전체 롤백.
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select fee_rate_bp into v_fee_bp from dealer_accounts where dealer_id = p_dealer_id;
  v_fee := round(v_gross * coalesce(v_fee_bp, 0) / 10000.0)::int;
  v_net_due := v_minted - v_spent + v_fee;

  update dealer_settlements
  set point_minted = v_minted, point_spent = v_spent, fee_amount = v_fee, net_due = v_net_due,
      period_start = v_start, period_end = v_end
  where id = v_settlement.id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function fn_create_dealer_claim(uuid, uuid) from public;
grant execute on function fn_create_dealer_claim(uuid, uuid) to service_role;

-- ② v_dealer_rider_stats.point_paid 정정 --------------------------------------
-- create or replace: 컬럼 순서·타입 불변, point_paid 표현식만 net 기준으로 교정.
create or replace view v_dealer_rider_stats with (security_invoker = true) as
select
  rp.id                                   as rider_id,
  rp.dealer_id                            as dealer_id,
  p.display_name                          as rider_name,
  rp.verify_status                        as verify_status,
  rp.is_online                            as is_online,
  coalesce(o.completed_count, 0)          as completed_count,
  coalesce(o.collected_kg, 0)             as collected_kg,
  coalesce(o.cash_paid, 0)                as cash_paid,
  coalesce(o.point_paid, 0)               as point_paid,
  coalesce(rs.signed_up, 0)               as referral_signed_up,
  coalesce(rs.activated, 0)               as referral_activated
from rider_profiles rp
join profiles p on p.id = rp.id
left join (
  select
    rider_id,
    count(*) filter (where status = 'COMPLETED')                                            as completed_count,
    sum(coalesce(final_kg, measured_kg, 0)) filter (where status = 'COMPLETED')             as collected_kg,
    sum(cash_paid_amount) filter (where status = 'COMPLETED' and coalesce(payout_method,'CASH') = 'CASH')  as cash_paid,
    -- [14 J4] POINT 실지급(minted) = net(>0). 레거시(net_amount null=상계 없음)는 cash_paid_amount 폴백.
    sum(case when net_amount is null then cash_paid_amount else greatest(net_amount, 0) end)
      filter (where status = 'COMPLETED' and payout_method = 'POINT')                        as point_paid
  from pickup_orders
  where rider_id is not null
  group by rider_id
) o on o.rider_id = rp.id
left join v_referral_stats rs on rs.referrer_rider_id = rp.id;

grant select on v_dealer_rider_stats to authenticated;

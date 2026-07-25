-- [14 J4] 상계 도입 후 남은 소비처 드리프트 정리 + 수수료 계산 오버플로 수정.
--
-- 배경: 20260724000003/005가 `cash_paid_amount`를 **폐유 총액(gross)으로 동결**하고 실제 정산액을
-- 신규 `net_amount`(= 폐유 총액 − 신유 대금, 음수 가능)로 분리했다. 원장도 net 기준으로 발행된다
-- (POINT & net>0 → EARN(+net), POINT & net<0 → TRADE_PURCHASE(−|net|), net=0 → 무기록).
-- 20260724000008이 v_dealer_rider_stats.point_paid를 net 기준으로 고쳤으나 **같은 계열의 다른 뷰들이
-- 남아 있었다** — 이 파일이 그 나머지를 마저 정리한다.
--
-- 증상: 신유 구매를 동반한 주문(order_kind PURCHASE/MIXED)에서
--   · 지급액이 실제보다 크게 계상되고(폐유 총액 전액),
--   · net<0(점주가 신유 대금을 지불한 경우)이면 **부호까지 반대**로 잡힌다.
-- 08 P5가 v_rider_payout_daily를 "라이더-플랫폼 오프라인 정산의 유일한 대사 근거"로 지목했으므로
-- 이 표가 틀리면 실제 정산 청구가 틀어진다.
--
-- 레거시 폴백: order_kind/net_amount가 null인 기존 주문은 net_amount도 null이므로
-- `coalesce`로 cash_paid_amount를 그대로 쓴다(20260724000008 point_paid와 동일 패턴).
-- 뷰는 전부 **컬럼 순서·이름·타입을 보존**한 채 집계식만 교체한다(append-only 계약 유지).

-- ── ① v_pickup_stats_daily — 수단별 금액을 net 기준으로 ────────────────────────
-- total_cash(= 총 지급액)와 cash_amount/point_amount 모두 net 기준으로 통일한다.
-- gross 지표가 필요하면 끝에 append한 total_gross를 쓴다(기존 컬럼 순서 불변).
create or replace view v_pickup_stats_daily
  with (security_invoker = true)
as
select
  completed_at::date            as day,
  count(*)                      as completed_count,
  coalesce(sum(final_kg),0)     as total_kg,
  coalesce(sum(coalesce(net_amount, cash_paid_amount)),0)::int as total_cash,
  coalesce(sum(coalesce(net_amount, cash_paid_amount)) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int as cash_amount,
  coalesce(sum(coalesce(net_amount, cash_paid_amount)) filter (where payout_method='POINT'),0)::int                 as point_amount,
  count(*) filter (where coalesce(payout_method,'CASH')='CASH') as cash_count,
  count(*) filter (where payout_method='POINT')                 as point_count,
  -- [14 J4 append] 상계 전 폐유 총액(수수료 베이스·거래규모 지표). 기존 컬럼 뒤에만 추가한다.
  coalesce(sum(cash_paid_amount),0)::int                        as total_gross,
  coalesce(sum(purchase_amount),0)::int                         as total_purchase
from pickup_orders
where status='COMPLETED' and completed_at is not null and is_admin()
group by 1;

-- ── ② v_rider_payout_daily — 라이더별 지급 실적을 net 기준으로 ────────────────
-- point_amount는 실제 EARN 발행액과 일치해야 한다(08 P5 대사 근거).
-- CASH는 음수 net(라이더가 점주에게서 받은 경우)도 의미가 있으므로 부호를 살린다.
create or replace view v_rider_payout_daily
  with (security_invoker = true)
as
select
  rider_id,
  completed_at::date as day,
  count(*)           as completed_count,
  coalesce(sum(final_kg),0) as total_kg,
  coalesce(sum(coalesce(net_amount, cash_paid_amount)) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int as cash_amount,
  -- POINT는 발행(EARN)만 집계 — net<0은 회수(TRADE_PURCHASE)라 지급 실적이 아니다.
  coalesce(sum(greatest(coalesce(net_amount, cash_paid_amount), 0)) filter (where payout_method='POINT'),0)::int    as point_amount,
  -- [14 J4 append] POINT 회수분(신유 대금으로 차감된 포인트)과 상계 전 총액.
  coalesce(sum(greatest(-coalesce(net_amount, cash_paid_amount), 0)) filter (where payout_method='POINT'),0)::int   as point_spent_amount,
  coalesce(sum(cash_paid_amount),0)::int                                                                           as gross_amount
from pickup_orders
where status='COMPLETED' and completed_at is not null and rider_id is not null and is_admin()
group by 1, 2;

-- ── ③ v_dealer_rider_stats.cash_paid — 20260724000008이 point_paid만 고쳤던 나머지 ──
-- CASH 경로도 상계 대상이다(현장에서 현금으로 차액만 주고받는다). 부호를 살려야 net<0에서
-- "라이더가 점주에게 지불"이 음수로 드러난다.
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
    -- [14 J4] CASH도 상계 대상(현장에서 차액만 주고받는다). 부호를 살려 net<0(라이더가 점주에게
    -- 지불)이 음수로 드러나게 한다. 레거시(net_amount null)는 cash_paid_amount 폴백.
    sum(coalesce(net_amount, cash_paid_amount)) filter (where status = 'COMPLETED' and coalesce(payout_method,'CASH') = 'CASH')  as cash_paid,
    -- [14 J4] POINT 실지급(minted) = net(>0). 레거시(net_amount null=상계 없음)는 cash_paid_amount 폴백.
    sum(case when net_amount is null then cash_paid_amount else greatest(net_amount, 0) end)
      filter (where status = 'COMPLETED' and payout_method = 'POINT')                        as point_paid
  from pickup_orders
  where rider_id is not null
  group by rider_id
) o on o.rider_id = rp.id
left join v_referral_stats rs on rs.referrer_rider_id = rp.id;

grant select on v_dealer_rider_stats to authenticated;

-- ── ④ fn_create_dealer_claim 수수료 계산 int4 오버플로 ────────────────────────
-- `v_gross * v_fee_bp / 10000.0`은 `*`와 `/`가 동일 우선순위·좌결합이라 **int4 곱셈이 먼저** 평가된다.
-- v_gross는 미정산 주문의 Σcash_paid_amount라 누적되며, fee_rate_bp는 CHECK(0..10000)로 최대 100%까지
-- 설정 가능하다(admin UI가 입력 필드로 노출). 실측: gross 4,300,000 × 500bp에서 이미
-- "integer out of range"로 청구 생성이 실패한다 → 스탬핑 불가 → 미정산 윈도우가 영원히 리셋되지 않고,
-- usage > credit_limit에 걸려 해당 좌상 라이더의 POINT 완료가 전부 DEALER_LIMIT_EXCEEDED로 막히는 교착.
-- (14 C7 "요율 초기 0%" 덕에 기본 구성에서는 미도달이지만, 요율을 켜는 순간 터진다.)
-- 수정: numeric으로 승격해 곱셈 자체를 int4 밖에서 수행한다.
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
  -- [14 J4] numeric 승격 — int4끼리의 곱셈이 먼저 평가돼 gross가 커지면 확실히 오버플로한다.
  v_fee := round(v_gross::numeric * coalesce(v_fee_bp, 0) / 10000.0)::int;
  v_net_due := v_minted - v_spent + v_fee;

  update dealer_settlements
  set point_minted = v_minted, point_spent = v_spent, fee_amount = v_fee, net_due = v_net_due,
      period_start = v_start, period_end = v_end
  where id = v_settlement.id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

-- [14 J4] `create or replace function`은 기존 ACL을 **보존**하므로(실측 확인) 20260724000010의 회수는
-- 그대로 유지된다. 그래도 명시해 두는 이유는 이 파일만 따로 떼어 적용하는 경우(핫픽스·부분 재적용)를
-- 대비한 멱등성 때문이다 — 회수가 이미 돼 있으면 무해한 no-op이다.
-- PUBLIC을 함께 회수하는 이유는 20260724000010 주석 참조(내장 기본값이 PUBLIC에 EXECUTE를 준다).
revoke execute on function fn_create_dealer_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function fn_create_dealer_claim(uuid, uuid) to service_role;

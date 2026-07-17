-- [09 H8/H6] 라이더 추천 보상 정산 처리 — 오프라인 지급의 이력 마킹 (docs/spec/09-referral.md H8).
--
-- 순수 추가(기존 동작 무영향). 원장 발행 없음 — 라이더 지갑 없음(08 P5) 원칙 유지: 실 지급은
-- 오프라인에서 이뤄지고, 이 마이그레이션은 그 "지급 완료" 이력(누가·언제)을 referrals에 기록해
-- admin 정산 큐(미지급 목록)와 통계(settled/unsettled 분리)를 가능하게 한다.
-- 쓰기는 service_role RPC(fn_settle_referral_reward)에만 — referrals insert/update 정책 부재 유지.

-- ===== ① 정산 마킹 컬럼 =====
alter table referrals
  add column reward_settled_at timestamptz,
  add column reward_settled_by uuid references profiles(id);
comment on column referrals.reward_settled_at is
  '라이더 보상 오프라인 지급 완료 시각(09 H8). null=미정산. ACTIVATED에서만 기록 가능(fn_settle_referral_reward).';

-- ===== ② v_referral_stats에 settled/unsettled 합계 append =====
-- create or replace — 기존 컬럼 순서·정의 불변, 말미에 2컬럼 추가(교체 뷰 제약 준수).
-- security_invoker는 재지정 필수(replace 시 reloptions 미보존 방지), 기존 grant는 보존된다.
create or replace view v_referral_stats
  with (security_invoker = true)
as
select
  referrer_rider_id,
  count(*)::int                                                          as signed_up,
  count(*) filter (where status = 'ACTIVATED')::int                      as activated,
  coalesce(sum(supplier_bonus) filter (where status='ACTIVATED'),0)::int as supplier_bonus_paid,
  coalesce(sum(rider_reward)   filter (where status='ACTIVATED'),0)::int as rider_reward_earned,
  coalesce(sum(rider_reward)   filter (where status='ACTIVATED' and reward_settled_at is not null),0)::int as rider_reward_settled,
  coalesce(sum(rider_reward)   filter (where status='ACTIVATED' and reward_settled_at is null),0)::int     as rider_reward_unsettled
from referrals
group by referrer_rider_id;

-- =========================================================================
-- ③ fn_settle_referral_reward: 보상 정산 마킹/해제. service_role만(Edge referral-settle 경유).
--   - FOR UPDATE 직렬화. 대상 없음 → 'NOT_FOUND'. ACTIVATED 아님 → 'INVALID_TRANSITION'
--     (미활성 추천엔 지급할 보상이 확정되지 않았다 — H6 활성화가 선행).
--   - p_settle=true: 이미 정산돼 있으면 기존 행 반환(멱등 — 재클릭·재시도 안전).
--   - p_settle=false: 마킹 해제(오기록 정정용). 미정산 상태면 역시 멱등 no-op.
-- =========================================================================
create or replace function fn_settle_referral_reward(
  p_referral_id uuid,
  p_admin_id uuid,
  p_settle boolean
) returns referrals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row referrals;
begin
  select * into v_row from referrals where id = p_referral_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_row.status <> 'ACTIVATED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if p_settle then
    if v_row.reward_settled_at is not null then
      return v_row; -- 이미 정산됨(멱등)
    end if;
    update referrals
    set reward_settled_at = now(), reward_settled_by = p_admin_id
    where id = p_referral_id
    returning * into v_row;
  else
    if v_row.reward_settled_at is null then
      return v_row; -- 이미 미정산(멱등)
    end if;
    update referrals
    set reward_settled_at = null, reward_settled_by = null
    where id = p_referral_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function fn_settle_referral_reward(uuid, uuid, boolean) from public;
grant execute on function fn_settle_referral_reward(uuid, uuid, boolean) to service_role;

-- [09 H2] 라이더 추천(레퍼럴) 스키마 + RPC + 통계 뷰 (docs/spec/09-referral.md §1).
--
-- 순수 추가(기존 동작 무영향). 08 피벗 위에 얹는다. REFERRAL 원장 항목은 20260715000003에서 선추가.
--
-- 절대 규칙 1 확장: referrals·point_ledger 쓰기는 service_role RPC(fn_attach_referral/
-- fn_activate_referral)에만 존재. 잔액/실적은 뷰로만 조회. 안티어뷰즈는 전부 서버 강제(09 §안티어뷰즈).

-- ===== ① 추천 상태 enum =====
create type referral_status as enum ('SIGNED_UP', 'ACTIVATED', 'CANCELLED');

-- ===== ② 라이더 추천코드 컬럼 (unique, 서버 생성 — Edge referral-code) =====
alter table rider_profiles add column referral_code text unique;
comment on column rider_profiles.referral_code is
  '라이더 추천코드(09 H2). Crockford base32 8자, Edge referral-code가 생성. APPROVED 라이더 코드만 attach 유효.';

-- ===== ③ referrals =====
create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_rider_id uuid not null references rider_profiles(id),
  referred_supplier_id uuid not null unique references supplier_profiles(id),  -- 점주 1인 1회
  code text not null,                                    -- 사용된 코드 스냅샷
  status referral_status not null default 'SIGNED_UP',
  supplier_bonus int not null check (supplier_bonus >= 0),  -- 활성화 시 점주 REFERRAL 포인트(스냅샷)
  rider_reward int not null check (rider_reward >= 0),      -- 라이더 오프라인 정산 보상(스냅샷, admin 통계)
  signed_up_at timestamptz not null default now(),
  activated_at timestamptz,
  activating_order_id uuid references pickup_orders(id)
);
create index idx_referrals_referrer on referrals (referrer_rider_id, signed_up_at desc);

-- ===== ④ RLS =====
-- 라이더 본인(추천자) + 점주 본인(피추천자) + admin read. 쓰기 정책 부재 = service_role RPC만.
alter table referrals enable row level security;
create policy p_referral_read on referrals for select using (
  referrer_rider_id = (select auth.uid())
  or referred_supplier_id = (select auth.uid())
  or is_admin()
);

-- ===== ⑤ 통계 뷰 =====
-- 라이더별 실적(security_invoker=true → referrals RLS 의존): 라이더는 본인 1행, admin은 전체.
create view v_referral_stats
  with (security_invoker = true)
as
select
  referrer_rider_id,
  count(*)::int                                              as signed_up,
  count(*) filter (where status = 'ACTIVATED')::int          as activated,
  coalesce(sum(supplier_bonus) filter (where status='ACTIVATED'),0)::int as supplier_bonus_paid,
  coalesce(sum(rider_reward)   filter (where status='ACTIVATED'),0)::int as rider_reward_earned
from referrals
group by referrer_rider_id;

-- 일별 추이(admin 전용 — is_admin() 게이트 + security_invoker, 집계 뷰 선례 미러).
create view v_referral_daily
  with (security_invoker = true)
as
select
  signed_up_at::date                                        as day,
  count(*)::int                                             as signed_up,
  count(*) filter (where activated_at::date = signed_up_at::date)::int as activated_same_day
from referrals
where is_admin()
group by 1;

-- ===== ⑥ Realtime (라이더 실적 실시간 갱신 — point_ledger 선례) =====
alter publication supabase_realtime add table referrals;

-- ===== ⑦ GRANT (20260709000002 관례 미러) =====
grant select on referrals to authenticated, anon;
grant select on v_referral_stats to authenticated, anon;
grant select on v_referral_daily to authenticated, anon;
grant select, insert, update on referrals to service_role;

-- =========================================================================
-- ⑧ fn_attach_referral: 가입 직후 코드 연결. service_role만.
--   - 코드 정규화(대문자·trim) → APPROVED 라이더 해석. 없으면 INVALID_REFERRAL_CODE.
--   - 자기추천 차단(referrer <> supplier). 점주 1인 1회(unique) — 재-attach는 기존 행 반환(멱등).
--   - 보너스는 파라미터로 스냅샷(core 상수가 단일 진실).
-- =========================================================================
create or replace function fn_attach_referral(
  p_supplier_id uuid,
  p_code text,
  p_supplier_bonus int,
  p_rider_reward int
) returns referrals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
  v_rider_id uuid;
  v_existing referrals;
  v_row referrals;
begin
  -- 이미 추천된 점주면 기존 행 반환(선착순 최초 확정, 멱등 — 재시도·중복 호출 안전).
  select * into v_existing from referrals where referred_supplier_id = p_supplier_id;
  if found then
    return v_existing;
  end if;

  -- APPROVED 라이더의 코드만 유효.
  select id into v_rider_id from rider_profiles
  where referral_code = v_code and verify_status = 'APPROVED';
  if v_rider_id is null then
    raise exception 'INVALID_REFERRAL_CODE' using errcode = 'P0001';
  end if;

  -- 자기추천 차단(역할이 달라 통상 불가하나 방어).
  if v_rider_id = p_supplier_id then
    raise exception 'INVALID_REFERRAL_CODE' using errcode = 'P0001';
  end if;

  insert into referrals (referrer_rider_id, referred_supplier_id, code, supplier_bonus, rider_reward)
  values (v_rider_id, p_supplier_id, v_code, greatest(p_supplier_bonus,0), greatest(p_rider_reward,0))
  on conflict (referred_supplier_id) do nothing
  returning * into v_row;

  -- 경합으로 이미 삽입된 경우(동시 attach) 기존 행 반환.
  if v_row.id is null then
    select * into v_row from referrals where referred_supplier_id = p_supplier_id;
  end if;

  return v_row;
end;
$$;

revoke all on function fn_attach_referral(uuid, text, int, int) from public;
grant execute on function fn_attach_referral(uuid, text, int, int) to service_role;

-- =========================================================================
-- ⑨ fn_activate_referral: 추천 점주의 첫 수거 완료 시 활성화 + 보너스 발행. service_role만.
--   - referrals 행 FOR UPDATE. status<>'SIGNED_UP'(미추천·이미활성·취소)면 no-op(멱등).
--   - status='ACTIVATED' 전이 + REFERRAL 포인트 발행(fn_post_ledger 멱등 unique 백업).
--   - order-transition Edge가 완료 전이 성공 후 호출한다(fn_transition_order 본체 무변경, 09 H7).
-- =========================================================================
create or replace function fn_activate_referral(
  p_supplier_id uuid,
  p_order_id uuid
) returns referrals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row referrals;
begin
  select * into v_row from referrals
  where referred_supplier_id = p_supplier_id
  for update;

  -- 추천 없음 / 이미 활성 / 취소 → no-op(멱등). 정상 흐름의 대부분(추천 없는 점주)이 여기로 빠진다.
  if not found or v_row.status <> 'SIGNED_UP' then
    return null;
  end if;

  update referrals
  set status = 'ACTIVATED', activated_at = now(), activating_order_id = p_order_id
  where id = v_row.id
  returning * into v_row;

  -- 점주 추천 보너스 적립(REFERRAL). 멱등: point_ledger unique(order_id, entry_type, user_id).
  perform fn_post_ledger(p_supplier_id, 'REFERRAL', v_row.supplier_bonus, p_order_id,
    'referral activation', null, null);

  return v_row;
end;
$$;

revoke all on function fn_activate_referral(uuid, uuid) from public;
grant execute on function fn_activate_referral(uuid, uuid) to service_role;

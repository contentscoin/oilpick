-- [13 I1] 조직 계층 어드민–좌상(dealer)–라이더. docs/spec/13-org-dealer.md.
-- 전부 순수 추가(기존 정책·테이블 불변). 좌상 권한 = 소속 라이더 실적 통계 "조회" + (Edge를 통한)
-- 모집·배정·승인. 원장/포인트/상태전이/시세는 불변(CLAUDE.md 절대 규칙 1·2 유지). 정산 로직 없음(D5).

-- ── 소속 컬럼 ────────────────────────────────────────────────────────────
alter table rider_profiles add column if not exists dealer_id uuid references profiles(id);
create index if not exists idx_rider_dealer on rider_profiles(dealer_id);

-- ── 권한가드 확장: dealer_id도 service_role만 변경 가능 ────────────────────
-- 라이더 셀프(p_rider_self)나 좌상이 dealer_id를 임의로 바꿔 소속을 위조하는 것을 차단한다.
-- 배정은 dealer-assign Edge(service_role)가 소유권 검증 후 수행한다(RLS와 이중 방어).
-- 20260704000016 guard_rider_verify를 verify_status·reject_reason + dealer_id 보호로 재정의.
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
  else
    new.verify_status := old.verify_status;
    new.reject_reason := old.reject_reason;
    new.dealer_id := old.dealer_id;     -- 소속 자기변경 차단(배정은 Edge로만)
  end if;
  return new;
end;
$$;

-- ── 헬퍼: 현재 사용자가 이 라이더의 소속 좌상인가(RLS·Edge 공용) ──────────
-- is_admin() 패턴 미러(SECURITY DEFINER → 하위 rider_profiles RLS 우회, 정책 재귀 방지).
create or replace function fn_dealer_owns_rider(p_rider uuid) returns boolean as
$$ select exists(
     select 1 from rider_profiles rp
     where rp.id = p_rider and rp.dealer_id = auth.uid()
   ) $$
language sql security definer stable set search_path = public;

-- ── RLS: 좌상의 소속 범위 조회(SELECT) 전용. 쓰기는 Edge(service_role)로만 ──
-- 1) 소속 라이더 프로필
create policy p_rider_profiles_read_by_dealer on rider_profiles
  for select using (dealer_id = auth.uid());
-- 2) 소속 라이더의 이름/전화(profiles)
create policy p_profiles_read_own_riders on profiles
  for select using (fn_dealer_owns_rider(id));
-- 3) 소속 라이더가 배정된 주문(관할 운행·통계 소스)
create policy p_orders_read_by_dealer on pickup_orders
  for select using (rider_id is not null and fn_dealer_owns_rider(rider_id));
-- 4) 소속 라이더의 추천 실적
create policy p_referrals_read_by_dealer on referrals
  for select using (fn_dealer_owns_rider(referrer_rider_id));
-- 5) 라이더가 자기 소속 좌상의 프로필(상호)을 조회(마이페이지 "소속" 표기, I5)
create policy p_profiles_read_my_dealer on profiles
  for select using (id = (select dealer_id from rider_profiles where id = auth.uid()));

-- ── 실적 통계 뷰(security_invoker → RLS가 좌상/admin 범위를 강제) ──────────
-- 라이더별 완료 건수·수거 kg·지급 합계(현금/포인트)·레퍼럴 실적. 금액은 표시용 통계일 뿐
-- 정산 로직 없음(D5). cash_paid_amount는 08 P3에서 CASH·POINT 지급액을 모두 담는다.
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
    sum(cash_paid_amount) filter (where status = 'COMPLETED' and payout_method = 'POINT')   as point_paid
  from pickup_orders
  where rider_id is not null
  group by rider_id
) o on o.rider_id = rp.id
left join v_referral_stats rs on rs.referrer_rider_id = rp.id;

grant select on v_dealer_rider_stats to authenticated;

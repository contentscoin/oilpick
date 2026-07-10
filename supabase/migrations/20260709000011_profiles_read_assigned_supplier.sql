-- 06 E8-④: apps/rider ActiveRunPage [사장님께 전화] — 06-enhancement-plan.md E8-④:
-- "ActiveRunPage에 [사장님께 전화] tel: 버튼 (user 앱 DriverCard 패턴 역방향; supplier phone은
-- 배정 라이더에게 이미 RLS 허용된 범위 확인 후, 없으면 조회 정책 추가 필요 — 20260704000010
-- 마이그레이션 패턴 참고)".
--
-- 배경: 기존 RLS에서 rider가 supplier의 profiles 행(phone/display_name)을 읽을 방법이 없다
-- (p_profiles_self는 본인/admin만, p_profiles_read_assigned_rider는 supplier→rider 방향만).
-- 20260704000010_rider_card_read_policy.sql의 fn_is_assigned_rider_of_caller(supplier가 자신에게
-- 배정된 rider의 프로필 read)를 **대칭 복제**한다 — 방향만 반대(rider가 자신이 배정된 주문의
-- supplier 프로필 read)인 동일한 "본인이 관련된 주문의 상대방 정보 read" 패턴이다.
--
-- security definer로 pickup_orders 조회를 감싸는 이유도 원본과 동일: profiles 정책 안에서
-- pickup_orders를 직접(RLS 평가 대상으로) 조회하면 pickup_orders의 기존 정책
-- p_order_open_calls가 rider_profiles를 참조해 정책 순환("infinite recursion detected in
-- policy")이 생길 수 있으므로, RLS를 우회하는 함수로 끊는다. search_path는 SECURITY DEFINER
-- 하이재킹 방지를 위해 생성 시점부터 고정한다(20260704000014_function_search_path.sql 패턴 —
-- 원본은 사후 ALTER로 고정했으나 신규 함수는 처음부터 명시).
--
-- EXECUTE 권한은 원본(20260704000010) 관례대로 별도 revoke/grant 없음 — RLS 정책 평가 주체
-- (authenticated/anon)가 실행할 수 있어야 하므로 함수 기본 PUBLIC EXECUTE를 유지한다.
-- status 제한도 원본 정책과 동일하게 두지 않는다(배정 이력만으로 read 허용 — 원본 미러).
create or replace function fn_is_assigned_supplier_of_caller(p_supplier_id uuid) returns boolean as
$$ select exists (
  select 1 from pickup_orders o
  where o.supplier_id = p_supplier_id and o.rider_id = auth.uid()
) $$
language sql security definer stable set search_path = public;

create policy p_profiles_read_assigned_supplier on profiles for select using (
  fn_is_assigned_supplier_of_caller(profiles.id)
);

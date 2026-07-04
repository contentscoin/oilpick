-- T8: apps/user U6~U9 "/orders/:id" 상태별 화면 — 03-frontend.md 63행:
-- "ACCEPTED~: MapView(...)+OrderTimeline+라이더 카드(이름/차량/인증배지/전화 tel:)".
--
-- 배경: 01-db-schema.sql의 기존 RLS는 profiles/rider_profiles를 "본인 또는 admin"만 select
-- 하도록 허용한다(p_profiles_self, p_rider_self, 20260704000001_init.sql:190,196). supplier가
-- 자신에게 배정된 라이더의 이름/차량번호/인증상태/전화번호를 조회할 방법이 없어 스펙이 명시한
-- 라이더 카드를 렌더할 수 없다 — 이는 새로운 설계 판단이 아니라, p_order_rider(주문 당사자
-- rider의 자기 주문 select, 20260704000001_init.sql:208)·p_events_read(주문 관계자의 이벤트
-- read, 같은 파일 216행)와 동일한 "본인이 관련된 주문의 상대방 정보 read" 패턴을 profiles/
-- rider_profiles에 대칭적으로 적용하는 것이다.
--
-- 재시도(recursion 수정): 최초 버전은 profiles/rider_profiles 정책 안에서 직접
-- `exists(select 1 from pickup_orders ...)`를 썼는데, pickup_orders 자체의 기존 정책
-- p_order_open_calls가 rider_profiles를 참조한다(20260704000001_init.sql:209~212) —
-- 즉 rider_profiles의 RLS가 pickup_orders를 보고, pickup_orders의 RLS가 다시
-- rider_profiles를 보는 순환이 생겨 실제로 "infinite recursion detected in policy for
-- relation pickup_orders" 에러로 재현됐다(로컬에서 GET .../profiles, .../pickup_orders
-- 요청이 전부 500으로 실패하는 것을 postgres 로그로 직접 확인). is_admin()과 동일하게
-- security definer 함수로 pickup_orders 조회를 감싸 RLS 평가를 우회하면 순환이 끊긴다
-- (security definer 함수 본문은 호출자의 RLS가 아니라 함수 소유자 권한으로 실행되므로
-- pickup_orders의 정책이 다시 트리거되지 않는다).
create or replace function fn_is_assigned_rider_of_caller(p_rider_id uuid) returns boolean as
$$ select exists (
  select 1 from pickup_orders o
  where o.rider_id = p_rider_id and o.supplier_id = auth.uid()
) $$
language sql security definer stable;

create policy p_profiles_read_assigned_rider on profiles for select using (
  fn_is_assigned_rider_of_caller(profiles.id)
);

create policy p_rider_profiles_read_by_supplier on rider_profiles for select using (
  fn_is_assigned_rider_of_caller(rider_profiles.id)
);

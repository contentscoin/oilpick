-- fn_find_eligible_riders: 반경 내 매칭 대상 라이더 조회 헬퍼.
-- 근거:
--   docs/spec/02-api.md "1. order-create" 절 broadcastCall(orderId, radiusKm):
--     "rider_profiles에서 verify_status='APPROVED' and is_online and last_location 반경 내
--      and 진행중 주문 없음 검색"
--   docs/spec/04-tasks.md T4 (order-create/order-expire의 반경 브로드캐스트)
--
-- 상태 전이나 포인트 원장 로직이 아닌 순수 조회 헬퍼이므로 fn_transition_order/fn_post_ledger와
-- 달리 새 RPC로 분리한다(02-api.md의 "상태 전이+원장 기록은 단일 RPC로" 원칙과 무관 — 이 함수는
-- 읽기 전용 반경 검색이며 트랜잭션 보장이 필요한 쓰기 로직이 아니다).
--
-- service_role(Edge Function)에서만 호출 — 클라이언트에는 EXECUTE 권한을 주지 않는다.
create or replace function fn_find_eligible_riders(
  p_lat double precision,
  p_lng double precision,
  p_radius_km int
) returns table (rider_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select r.id as rider_id
  from rider_profiles r
  where r.verify_status = 'APPROVED'
    and r.is_online
    and r.last_location is not null
    and st_dwithin(
      r.last_location,
      st_setsrid(st_point(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    and not exists (
      select 1 from pickup_orders o
      where o.rider_id = r.id
        and o.status in ('ACCEPTED', 'ARRIVED', 'PICKED_UP')
    );
$$;

revoke all on function fn_find_eligible_riders(double precision, double precision, int) from public;

-- fn_point_lat_lng: geography(point) → { lat, lng } 변환 헬퍼.
-- order-expire의 재브로드캐스트가 pickup_orders.pickup_location에서 좌표를 복원할 때 사용.
-- 순수 조회/변환 함수이며 상태 전이·원장 로직과 무관.
create or replace function fn_point_lat_lng(p_geog geography)
returns table (lat double precision, lng double precision)
language sql
security definer
set search_path = public
immutable
as $$
  select st_y(p_geog::geometry) as lat, st_x(p_geog::geometry) as lng;
$$;

revoke all on function fn_point_lat_lng(geography) from public;

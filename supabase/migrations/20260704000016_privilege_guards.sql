-- 어드버서리얼 크리티컬 리뷰(2026-07-06)에서 확인된 CRITICAL/HIGH 3건 수정.
--
-- (1) CRITICAL: p_profiles_update가 role 컬럼을 제약하지 않아, 임의 인증 사용자가
--     `update profiles set role='admin' where id=auth.uid()`로 자기 role을 admin으로 올려
--     전면 권한 상승이 가능했다(이후 is_admin() 통과 → point-adjust로 포인트 무한 발행 등).
-- (2) CRITICAL: p_rider_self가 FOR ALL이라 라이더가 자기 rider_profiles.verify_status를
--     'APPROVED'로 셀프 설정해 admin 서류 검수를 우회할 수 있었다(insert/update 양쪽).
-- (3) HIGH: order-accept의 '진행중 주문 없음' 검사가 ACCEPT RPC와 비원자적(TOCTOU)이라
--     동일 라이더가 서로 다른 두 콜을 동시에 수락하면 둘 다 통과해 이중 배정됐다.
--
-- 접근: (1)(2)는 트리거로 민감 컬럼을 비-service 호출에서 강제(기본값/기존값 고정). 컬럼 나열이
-- 필요없어 정상 업데이트(fcm_token/is_online/bank_*)를 깨지 않는다. service_role(Edge Function:
-- rider-verify 등)과 postgres/supabase_admin(마이그레이션·시드)만 예외적으로 변경 가능.
-- (3)은 라이더당 활성 주문 1건을 부분 유니크 인덱스로 DB에서 선언적으로 강제 — 동시 이중수락 시
-- 두 번째 트랜잭션이 유니크 위반으로 롤백되어 이중 배정이 원천 불가능하다.

-- ===== (1) profiles.role 자기변경 차단 =====
create or replace function guard_profile_role() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- Edge Function(service_role)·마이그레이션/시드(postgres 등)는 예외.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  -- 그 외(authenticated 등)는 role 변경 불가 — 항상 기존값으로 강제.
  new.role := old.role;
  return new;
end;
$$;

create trigger trg_guard_profile_role
  before update on profiles
  for each row execute function guard_profile_role();

-- ===== (2) rider_profiles.verify_status / reject_reason 자기설정 차단 =====
create or replace function guard_rider_verify() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 라이더 셀프 가입 시 항상 미검수 상태로 강제(APPROVED 자기설정 차단).
    new.verify_status := 'PENDING';
    new.reject_reason := null;
  else
    -- UPDATE: verify_status/reject_reason는 기존값 고정(다른 컬럼 갱신은 허용).
    new.verify_status := old.verify_status;
    new.reject_reason := old.reject_reason;
  end if;
  return new;
end;
$$;

create trigger trg_guard_rider_verify
  before insert or update on rider_profiles
  for each row execute function guard_rider_verify();

-- ===== (3) 라이더당 활성 주문 1건 불변식 (TOCTOU 이중배정 차단) =====
-- 활성 상태(라이더가 배정되어 진행 중)에서 rider_id는 유일해야 한다. REQUESTED(rider_id NULL)와
-- 종결 상태(COMPLETED/CANCELLED)는 인덱스 대상이 아니므로 새 콜 수락에 지장을 주지 않는다.
create unique index idx_rider_single_active_order
  on pickup_orders (rider_id)
  where status in ('ACCEPTED', 'ARRIVED', 'PICKED_UP', 'DISPUTED');

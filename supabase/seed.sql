-- 04-tasks.md T3: admin 계정, 집하장 1개, 초기 price_tick 1건.
-- 로컬 개발/시뮬레이션 전용 시드. auth.users에 먼저 admin용 유저를 만든 뒤 profiles를 연결한다.
--
-- (T11 admin 로그인 E2E 검증 중 발견한 버그 수정) information_schema.columns로 실측한 결과
-- auth.users의 confirmation_token/recovery_token/email_change_token_new/email_change
-- 4개 character varying 컬럼은 기본값이 없다(phone_change/phone_change_token/
-- email_change_token_current/reauthentication_token 등 나머지 token류 컬럼은
-- ''::character varying 기본값을 가짐 — 이 4개만 예외). 이 insert가 해당 컬럼을 명시하지
-- 않으면 NULL로 저장되는데, GoTrue(v2.192.0)의 signInWithPassword가 auth.users를 Go
-- string 필드로 스캔하면서 NULL을 만나면 "converting NULL to string is unsupported" 500
-- 에러로 로그인 자체가 실패한다 — 실제 admin 로그인 시도 2회(각각 confirmation_token류,
-- email_change 컬럼에서)로 재현하고 docker logs supabase_auth_oilpick으로 원인을 특정했다
-- (태스크 브리핑에 "GoTrue 시드 계정의 NULL 토큰 컬럼 이슈가 이미 발견돼 있으니"라고 언급된
-- 바로 그 문제). 새로운 설계 판단이 아니라 이미 명시된 admin 시드 계정이 실제로 로그인
-- 가능해야 한다는 기존 요구(T3 DoD, 03-frontend.md "admin 로그인")를 만족시키기 위한 버그
-- 수정이라 판단해 4개 컬럼 모두 빈 문자열로 명시했다.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@oilpick.local',
  crypt('oilpick-admin-seed', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
) on conflict (id) do nothing;

insert into profiles (id, role, phone, display_name)
values ('00000000-0000-0000-0000-000000000001', 'admin', '010-0000-0000', 'OilPick 관리자')
on conflict (id) do nothing;

-- ===== 집하장 1개 =====
insert into depots (id, name, address, location, is_active)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'OilPick 서울 집하장',
  '서울특별시 강서구 오일픽로 1',
  st_point(126.8225, 37.5509)::geography,
  true
) on conflict (id) do nothing;

-- ===== 초기 price_tick 1건 =====
insert into price_ticks (price_per_kg, rider_fee, created_by)
values (700, 5000, '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- 04-tasks.md T3: admin 계정, 집하장 1개, 초기 price_tick 1건.
-- 로컬 개발/시뮬레이션 전용 시드. auth.users에 먼저 admin용 유저를 만든 뒤 profiles를 연결한다.

-- ===== admin auth user + profile =====
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@oilpick.local',
  crypt('oilpick-admin-seed', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
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

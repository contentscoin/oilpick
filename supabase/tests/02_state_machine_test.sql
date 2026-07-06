-- pgTAP: 주문 상태머신 가드 (00-domain.md 전이표). fn_transition_order의 role/actor 가드,
-- 이중수락 차단(부분 유니크 인덱스), QR 검증, 수락 후 공급자 취소 불가를 검증한다.
create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

-- ── 픽스처 ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup2@t.local',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid2@t.local',now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid3@t.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','supplier','010','공급'),
  ('22222222-2222-2222-2222-222222222222','rider','011','라이더A'),
  ('44444444-4444-4444-4444-444444444444','rider','012','라이더B');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('11111111-1111-1111-1111-111111111111','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('22222222-2222-2222-2222-222222222222','b','12가1234','APPROVED'),
  ('44444444-4444-4444-4444-444444444444','b','34나5678','APPROVED');
insert into depots (id, name, address, location, qr_secret) values
  ('dddddddd-0000-0000-0000-0000000000d1','집하장','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,'secret-qr-123');
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, snapshot_rider_fee) values
  ('00000000-bbbb-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,5000),
  ('00000000-bbbb-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,5000);

-- 1) ACCEPT는 rider만
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ACCEPT','11111111-1111-1111-1111-111111111111','supplier') $$,
  'INVALID_TRANSITION', 'supplier는 ACCEPT 불가');

-- 정상 수락(라이더A)
select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ACCEPT','22222222-2222-2222-2222-222222222222','rider');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000001'), 'ACCEPTED', '라이더A 정상 수락');

-- 2) 이미 수락된 주문 재수락 → ALREADY_ACCEPTED
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ACCEPT','44444444-4444-4444-4444-444444444444','rider') $$,
  'ALREADY_ACCEPTED', '수락된 주문 재수락은 ALREADY_ACCEPTED');

-- 3) 배정 안 된 라이더의 ARRIVE 불가
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ARRIVE','44444444-4444-4444-4444-444444444444','rider') $$,
  'INVALID_TRANSITION', '배정 안 된 라이더는 ARRIVE 불가');

-- 4) 라이더당 활성 주문 1건: 라이더A가 두 번째 주문 수락 → 유니크 위반(23505)
-- throws_ok에 SQLSTATE를 쓸 때는 4-인자 형태로: (sql, errcode, errmsg, description).
-- errmsg=NULL이면 메시지는 검사하지 않고 errcode(23505)만 확인한다.
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000002','ACCEPT','22222222-2222-2222-2222-222222222222','rider') $$,
  '23505', NULL, '라이더A 두 번째 주문 수락은 유니크 위반(이중배정 차단)');

-- 5) 수락 후 공급자 취소 불가(admin만) — ACCEPTED에서 supplier CANCEL
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','CANCEL','11111111-1111-1111-1111-111111111111','supplier','{"reason":"x"}'::jsonb) $$,
  'INVALID_TRANSITION', '수락 후 공급자 취소 불가');

-- 6) admin은 ACCEPTED 취소 가능
select lives_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','CANCEL',null,'admin','{"reason":"admin cancel"}'::jsonb) $$,
  'admin은 ACCEPTED 주문 취소 가능');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000001'), 'CANCELLED', 'admin 취소 후 CANCELLED');

select * from finish();
rollback;

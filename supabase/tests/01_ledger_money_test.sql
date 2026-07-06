-- pgTAP: 포인트 원장 자금 불변식 (00-domain.md "포인트 원장 규칙").
-- 주문 1건 완주(ACCEPT→ARRIVE→SUBMIT_MEASURE→CONFIRM_MEASURE→DELIVER) 동안
-- EARN=round(final_kg*snapshot_price), HOLD==RELEASE==snapshot_rider_fee, 멱등(이중지급 차단),
-- append-only 트리거를 검증한다. supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

-- ── 픽스처(트리거 예외 role인 postgres로 삽입) ──────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup@t.local',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid@t.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','supplier','010','공급'),
  ('22222222-2222-2222-2222-222222222222','rider','011','라이더');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('11111111-1111-1111-1111-111111111111','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('22222222-2222-2222-2222-222222222222','b','12가1234','APPROVED');
insert into depots (id, name, address, location, qr_secret) values
  ('dddddddd-0000-0000-0000-0000000000d1','집하장','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,'secret-qr-123');
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, snapshot_rider_fee)
  values ('00000000-aaaa-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','REQUESTED',45.0,'a',
          ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography, 700, 5000);

-- ── 라이프사이클 전개 ────────────────────────────────────────────────────
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','ACCEPT','22222222-2222-2222-2222-222222222222','rider');
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','ARRIVE','22222222-2222-2222-2222-222222222222','rider');
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','SUBMIT_MEASURE','22222222-2222-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','CONFIRM_MEASURE','11111111-1111-1111-1111-111111111111','supplier');

-- CONFIRM 시점 불변식
select is((select status from pickup_orders where id='00000000-aaaa-0000-0000-000000000001'), 'PICKED_UP', 'CONFIRM_MEASURE 후 PICKED_UP');
select is((select amount from point_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='EARN' and user_id='11111111-1111-1111-1111-111111111111'),
          31500, 'EARN = round(45.0*700) = 31500');
select is((select amount from point_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='HOLD' and user_id='22222222-2222-2222-2222-222222222222'),
          5000, 'HOLD = snapshot_rider_fee = 5000');
select is((select available from v_point_balance where user_id='11111111-1111-1111-1111-111111111111'), 31500, '공급자 available = EARN');
select is((select held from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 5000, '라이더 held = 5000 (아직 available 아님)');
select is((select available from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 0, '라이더 available = 0 (배송 전)');

-- 배송완료 → RELEASE
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','DELIVER','22222222-2222-2222-2222-222222222222','rider',
  '{"depotId":"dddddddd-0000-0000-0000-0000000000d1","qrSecret":"secret-qr-123"}'::jsonb);

select is((select status from pickup_orders where id='00000000-aaaa-0000-0000-000000000001'), 'COMPLETED', 'DELIVER 후 COMPLETED');
select is((select amount from point_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='RELEASE' and user_id='22222222-2222-2222-2222-222222222222'),
          5000, 'RELEASE = HOLD = snapshot_rider_fee (5000)');
select is((select available from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 5000, '배송완료 후 라이더 available = 5000 (held→available)');
select is((select held from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 0, '배송완료 후 라이더 held = 0');

-- 멱등: 이미 COMPLETED에 DELIVER 재호출 → 전이 거부(이중 RELEASE 없음)
select throws_ok(
  $$ select fn_transition_order('00000000-aaaa-0000-0000-000000000001','DELIVER','22222222-2222-2222-2222-222222222222','rider','{"depotId":"dddddddd-0000-0000-0000-0000000000d1","qrSecret":"secret-qr-123"}'::jsonb) $$,
  'INVALID_TRANSITION', '완료된 주문 DELIVER 재호출은 INVALID_TRANSITION');

-- append-only: 원장 UPDATE 차단
select throws_ok(
  $$ update point_ledger set amount = 0 where order_id='00000000-aaaa-0000-0000-000000000001' $$,
  'point_ledger is append-only', 'point_ledger UPDATE는 append-only 트리거로 차단');

select * from finish();
rollback;

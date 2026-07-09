-- pgTAP: 라이더 정지(SUSPENDED) 규제 게이트 (07 F11-①). 검증:
--   ① p_order_open_calls RLS — SUSPENDED 라이더는 REQUESTED 콜을 조회할 수 없다(0행), APPROVED는 보인다.
--   ② fn_transition_order ACCEPT 게이트 — 미승인/정지 라이더의 신규 콜 수락은 RIDER_NOT_ELIGIBLE로 거부,
--      주문은 REQUESTED 잔존. APPROVED만 수락 성공.
--   ③ 진행중 주문은 정지 후에도 완결 허용 — ACCEPT 외 전이(ARRIVE)는 무게이트.
--   ④ guard_rider_verify — authenticated(정지된 본인)가 verify_status를 셀프 APPROVED로 못 바꾼다(셀프 해제 차단).
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 픽스처 ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup7@t',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','susp@t',now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','appr@t',now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inpr@t',now(),now()),
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pend@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','supplier','010','공급'),
  ('22222222-2222-2222-2222-222222222222','rider','011','정지'),
  ('33333333-3333-3333-3333-333333333333','rider','012','승인'),
  ('44444444-4444-4444-4444-444444444444','rider','013','진행'),
  ('55555555-5555-5555-5555-555555555555','rider','014','대기');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('11111111-1111-1111-1111-111111111111','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
-- A=SUSPENDED, B/C=APPROVED, D=PENDING.
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('22222222-2222-2222-2222-222222222222','b','12가0001','SUSPENDED'),
  ('33333333-3333-3333-3333-333333333333','b','12가0002','APPROVED'),
  ('44444444-4444-4444-4444-444444444444','b','12가0003','APPROVED'),
  ('55555555-5555-5555-5555-555555555555','b','12가0004','PENDING');

-- 신 주문 3건(coupon_cost 1, 10kg, 시세 700).
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('00000000-eeee-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-eeee-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-eeee-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1);

-- 수락 성공 케이스용 쿠폰 선충전(B, C). A(정지)는 게이트가 쿠폰 이전에 차단하므로 불필요.
select fn_charge_coupon('33333333-3333-3333-3333-333333333333', 10, null, null, 'seed', null);
select fn_charge_coupon('44444444-4444-4444-4444-444444444444', 10, null, null, 'seed', null);

-- ============ ① open_calls RLS 조회 게이트 ============
-- 1) SUSPENDED 라이더는 REQUESTED 콜을 한 건도 조회할 수 없다(p_order_open_calls는 APPROVED만 허용).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from pickup_orders where status='REQUESTED'),
          0, 'SUSPENDED 라이더 open_calls select 0행');
reset role;

-- 2) APPROVED 라이더는 REQUESTED 콜을 조회할 수 있다(대조군).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select ok((select count(*)::int from pickup_orders where status='REQUESTED') >= 1,
          'APPROVED 라이더 open_calls select ≥1행(대조군)');
reset role;

-- ============ ② fn_transition_order ACCEPT 게이트 ============
-- 3) SUSPENDED 라이더 ACCEPT → RIDER_NOT_ELIGIBLE 거부.
select throws_ok(
  $$ select fn_transition_order('00000000-eeee-0000-0000-000000000001','ACCEPT','22222222-2222-2222-2222-222222222222','rider') $$,
  'RIDER_NOT_ELIGIBLE', 'SUSPENDED 라이더 ACCEPT는 RIDER_NOT_ELIGIBLE로 거부');
-- 4) 거부된 주문은 REQUESTED 잔존.
select is((select status from pickup_orders where id='00000000-eeee-0000-0000-000000000001'),
          'REQUESTED', 'SUSPENDED ACCEPT 거부 후 주문 REQUESTED 잔존');
-- 5) PENDING 라이더 ACCEPT도 동일 게이트로 거부(게이트가 APPROVED 외 전부 차단).
select throws_ok(
  $$ select fn_transition_order('00000000-eeee-0000-0000-000000000001','ACCEPT','55555555-5555-5555-5555-555555555555','rider') $$,
  'RIDER_NOT_ELIGIBLE', 'PENDING 라이더 ACCEPT도 RIDER_NOT_ELIGIBLE로 거부');
-- 6) APPROVED 라이더 ACCEPT → 성공.
select fn_transition_order('00000000-eeee-0000-0000-000000000002','ACCEPT','33333333-3333-3333-3333-333333333333','rider');
select is((select status from pickup_orders where id='00000000-eeee-0000-0000-000000000002'),
          'ACCEPTED', 'APPROVED 라이더 ACCEPT 성공');
-- 7) 게이트 통과 후 정상 쿠폰 CONSUME은 그대로 동작(잔액 10→9).
select is((select balance from v_coupon_balance where rider_id='33333333-3333-3333-3333-333333333333'),
          9, 'APPROVED ACCEPT 후 쿠폰 CONSUME 정상(잔액 10→9)');

-- ============ ③ 진행중 주문은 정지 후에도 완결 허용 ============
-- C(APPROVED)가 O3 수락 → 이후 정지 → ARRIVE(진행 전이)는 무게이트라 성공.
select fn_transition_order('00000000-eeee-0000-0000-000000000003','ACCEPT','44444444-4444-4444-4444-444444444444','rider');
update rider_profiles set verify_status='SUSPENDED', is_online=false where id='44444444-4444-4444-4444-444444444444';
select fn_transition_order('00000000-eeee-0000-0000-000000000003','ARRIVE','44444444-4444-4444-4444-444444444444','rider');
select is((select status from pickup_orders where id='00000000-eeee-0000-0000-000000000003'),
          'ARRIVED', '정지 후에도 진행중 주문 ARRIVE 완결 허용(ACCEPT 외 전이 무게이트)');

-- ============ ④ guard_rider_verify: 셀프 정지 해제 변조 차단 ============
-- 정지된 본인(A)이 authenticated로 verify_status를 APPROVED로 셀프 변경 시도 → 트리거가 기존값 강제.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update rider_profiles set verify_status='APPROVED' where id='22222222-2222-2222-2222-222222222222';
reset role;
select is((select verify_status::text from rider_profiles where id='22222222-2222-2222-2222-222222222222'),
          'SUSPENDED', 'authenticated는 셀프 정지 해제(verify_status SUSPENDED→APPROVED) 불가');

select * from finish();
rollback;

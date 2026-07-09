-- pgTAP: 권한 상승 가드 (20260704000016_privilege_guards.sql). 일반 인증 사용자(authenticated)가
-- 자기 profiles.role / rider_profiles.verify_status를 셀프 변경하지 못하고, service_role(Edge
-- Function)만 가능함을 검증한다. RLS(본인 행)는 jwt sub 설정으로 시뮬레이션한다.
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 픽스처(postgres = 트리거 예외) ────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup3@t.local',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid4@t.local',now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid5@t.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','supplier','010','공급'),
  ('22222222-2222-2222-2222-222222222222','rider','011','라이더'),
  ('33333333-3333-3333-3333-333333333333','rider','012','라이더2');
insert into rider_profiles (id, biz_number, vehicle_number) values
  ('22222222-2222-2222-2222-222222222222','b','12가1234');  -- 기본 verify_status = PENDING

-- 1) authenticated는 자기 role을 admin으로 못 바꿈(guard가 기존값 강제)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update profiles set role='admin' where id='11111111-1111-1111-1111-111111111111';
reset role;
select is((select role::text from profiles where id='11111111-1111-1111-1111-111111111111'),
          'supplier', 'authenticated는 profiles.role을 admin으로 상승 못함');

-- 2) rider는 verify_status를 셀프 APPROVED로 못 바꿈(UPDATE)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update rider_profiles set verify_status='APPROVED' where id='22222222-2222-2222-2222-222222222222';
reset role;
select is((select verify_status::text from rider_profiles where id='22222222-2222-2222-2222-222222222222'),
          'PENDING', 'rider는 verify_status UPDATE 셀프승인 불가');

-- 3) rider 신규 셀프 INSERT도 verify_status가 PENDING으로 강제됨
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('33333333-3333-3333-3333-333333333333','b','34나5678','APPROVED');
reset role;
select is((select verify_status::text from rider_profiles where id='33333333-3333-3333-3333-333333333333'),
          'PENDING', 'rider 셀프 INSERT는 verify_status PENDING 강제');

-- 4) service_role(Edge Function: rider-verify)은 승인 가능
set local role service_role;
update rider_profiles set verify_status='APPROVED' where id='22222222-2222-2222-2222-222222222222';
reset role;
select is((select verify_status::text from rider_profiles where id='22222222-2222-2222-2222-222222222222'),
          'APPROVED', 'service_role(Edge Function)은 verify_status 변경 가능');

-- 5) authenticated의 정상 업데이트(fcm_token)는 그대로 동작(가드가 다른 컬럼은 안 막음)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update profiles set fcm_token='tok-abc' where id='11111111-1111-1111-1111-111111111111';
reset role;
select is((select fcm_token from profiles where id='11111111-1111-1111-1111-111111111111'),
          'tok-abc', '정상 컬럼(fcm_token) 업데이트는 유지');

-- ── [07 F3a] 쿠폰 RPC EXECUTE 권한: service_role만 허용, 비 service_role 거부 ──────────
-- (revoke all from public + grant service_role. 절대 규칙 1 — 쿠폰 원장 쓰기는 service_role RPC만.)
select ok(not has_function_privilege('authenticated','public.fn_charge_coupon(uuid, int, int, uuid, text, uuid)','EXECUTE'),
          'authenticated는 fn_charge_coupon EXECUTE 불가');
select ok(not has_function_privilege('authenticated','public.fn_consume_coupon(uuid, uuid, int)','EXECUTE'),
          'authenticated는 fn_consume_coupon EXECUTE 불가');
select ok(has_function_privilege('service_role','public.fn_charge_coupon(uuid, int, int, uuid, text, uuid)','EXECUTE'),
          'service_role(Edge Function)은 fn_charge_coupon EXECUTE 가능');

-- ── [07 F3a] coupon_ledger append-only: UPDATE 차단 ──────────────────────────────────
insert into coupon_ledger (rider_id, entry_type, qty) values ('22222222-2222-2222-2222-222222222222','ADJUST',5);
select throws_ok(
  $$ update coupon_ledger set qty = 0 where rider_id='22222222-2222-2222-2222-222222222222' $$,
  'coupon_ledger is append-only', 'coupon_ledger UPDATE는 append-only 트리거로 차단');

select * from finish();
rollback;

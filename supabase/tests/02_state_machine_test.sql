-- pgTAP: 신모델 주문 상태머신 (00-domain.md 전이표, 07 §1-3). fn_transition_order의 role/actor 가드,
-- 이중수락 차단, 신 전이(ARRIVED→COMPLETED, DISPUTED→ARRIVED 복귀, FORCE_COMPLETE), admin CANCEL
-- 귀책(fault) 매트릭스와 쿠폰 환급, 레거시(coupon_cost null) 취소 무환급, 쿠폰 부족 ACCEPT 롤백을 검증한다.
create extension if not exists pgtap with schema extensions;

begin;
select plan(32);

-- ── 픽스처 ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s@t',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ra@t',now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rb@t',now(),now()),
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rc@t',now(),now()),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rd@t',now(),now()),
  ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000','authenticated','authenticated','re@t',now(),now()),
  ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rf@t',now(),now()),
  ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rg@t',now(),now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rh@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','supplier','010','공급'),
  ('22222222-2222-2222-2222-222222222222','rider','011','A'),
  ('44444444-4444-4444-4444-444444444444','rider','012','B'),
  ('55555555-5555-5555-5555-555555555555','rider','013','C'),
  ('66666666-6666-6666-6666-666666666666','rider','014','D'),
  ('77777777-7777-7777-7777-777777777777','rider','015','E'),
  ('88888888-8888-8888-8888-888888888888','rider','016','F'),
  ('99999999-9999-9999-9999-999999999999','rider','017','G'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','rider','018','H');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('11111111-1111-1111-1111-111111111111','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
-- 07 F13: seed.sql이 신모델 데모 라이더(rider_profiles 포함)를 선주입하므로, 이 픽스처는
-- 이미 존재하는 rider_profiles와 충돌하지 않도록 멱등 처리한다(assert 대상은 아래 특정 order/rider
-- id로 스코프돼 있어 시드 라이더가 결과에 영향 없음).
insert into rider_profiles (id, biz_number, vehicle_number, verify_status)
  select id, 'b', '12가'||right(id::text,4), 'APPROVED' from profiles where role='rider'
  on conflict (id) do nothing;

-- 신 주문 8건(coupon_cost 1) + 레거시 1건(O5, coupon_cost null). 모두 10kg, 시세 700.
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('00000000-bbbb-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,null),
  ('00000000-bbbb-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('00000000-bbbb-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1);

-- rH(insufficient 테스트) 외 라이더 전원에게 쿠폰 10장 선충전.
select fn_charge_coupon(id, 10, null, null, 'seed', null)
  from profiles where role='rider' and id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ============ 기본 가드 ============
-- 1) ACCEPT는 rider만
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000002','ACCEPT','11111111-1111-1111-1111-111111111111','supplier') $$,
  'INVALID_TRANSITION', 'supplier는 ACCEPT 불가');

-- 정상 수락(rA가 O1)
select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ACCEPT','22222222-2222-2222-2222-222222222222','rider');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000001'), 'ACCEPTED', 'rA 정상 수락(O1)');

-- 2) 이미 수락된 주문 재수락 → ALREADY_ACCEPTED (rB)
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ACCEPT','44444444-4444-4444-4444-444444444444','rider') $$,
  'ALREADY_ACCEPTED', '수락된 주문 재수락은 ALREADY_ACCEPTED');

-- 3) 배정 안 된 라이더(rB) ARRIVE 불가
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','ARRIVE','44444444-4444-4444-4444-444444444444','rider') $$,
  'INVALID_TRANSITION', '배정 안 된 라이더 ARRIVE 불가');

-- 4) 라이더당 활성 1건: rA가 O2 수락 → 유니크 위반(23505)
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000002','ACCEPT','22222222-2222-2222-2222-222222222222','rider') $$,
  '23505', NULL, 'rA 두 번째 활성 주문 수락은 유니크 위반');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000002'), 'REQUESTED', 'O2는 REQUESTED 유지');

-- 5) 수락 후 공급자 취소 불가
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','CANCEL','11111111-1111-1111-1111-111111111111','supplier','{"reason":"x"}'::jsonb) $$,
  'INVALID_TRANSITION', '수락 후 공급자 취소 불가');

-- ============ admin CANCEL 귀책(fault) ============
-- 6) admin CANCEL은 fault 필수(누락 → VALIDATION_ERROR)
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000001','CANCEL',null,'admin','{"reason":"x"}'::jsonb) $$,
  'VALIDATION_ERROR', 'admin CANCEL fault 누락 → VALIDATION_ERROR');

-- 7) admin CANCEL fault=RIDER → CANCELLED, 환급 없음
select fn_transition_order('00000000-bbbb-0000-0000-000000000001','CANCEL',null,'admin','{"reason":"rider fault"}'::jsonb,'RIDER');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000001'), 'CANCELLED', 'admin CANCEL(RIDER) → CANCELLED');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 9, 'fault=RIDER: 소진 유지(환급 없음), 잔액 9');
select is((select count(*)::int from coupon_ledger where order_id='00000000-bbbb-0000-0000-000000000001' and entry_type='REFUND'), 0, 'fault=RIDER: REFUND 없음');

-- 8) admin CANCEL fault=SUPPLIER → REFUND(+coupon_cost) (rB가 O3)
select fn_transition_order('00000000-bbbb-0000-0000-000000000003','ACCEPT','44444444-4444-4444-4444-444444444444','rider');
select is((select balance from v_coupon_balance where rider_id='44444444-4444-4444-4444-444444444444'), 9, 'rB ACCEPT 후 잔액 9');
select fn_transition_order('00000000-bbbb-0000-0000-000000000003','CANCEL',null,'admin','{"reason":"no-show"}'::jsonb,'SUPPLIER');
select is((select balance from v_coupon_balance where rider_id='44444444-4444-4444-4444-444444444444'), 10, 'fault=SUPPLIER: REFUND → 잔액 10 복구');
select is((select qty from coupon_ledger where order_id='00000000-bbbb-0000-0000-000000000003' and entry_type='REFUND'), 1, 'fault=SUPPLIER: REFUND qty=+coupon_cost(1)');

-- 9) admin CANCEL fault=SYSTEM → REFUND (rC가 O4)
select fn_transition_order('00000000-bbbb-0000-0000-000000000004','ACCEPT','55555555-5555-5555-5555-555555555555','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000004','CANCEL',null,'admin','{"reason":"price error"}'::jsonb,'SYSTEM');
select is((select balance from v_coupon_balance where rider_id='55555555-5555-5555-5555-555555555555'), 10, 'fault=SYSTEM: REFUND → 잔액 10 복구');

-- 10) 레거시(coupon_cost null) 취소 → 소진도 환급도 없음 (rD가 O5)
select fn_transition_order('00000000-bbbb-0000-0000-000000000005','ACCEPT','66666666-6666-6666-6666-666666666666','rider');
select is((select count(*)::int from coupon_ledger where order_id='00000000-bbbb-0000-0000-000000000005' and entry_type='CONSUME'), 0, '레거시(coupon_cost null): ACCEPT 시 CONSUME skip');
select fn_transition_order('00000000-bbbb-0000-0000-000000000005','CANCEL',null,'admin','{"reason":"legacy"}'::jsonb,'SUPPLIER');
select is((select balance from v_coupon_balance where rider_id='66666666-6666-6666-6666-666666666666'), 10, '레거시 취소: 환급 없음(잔액 10 불변)');
select is((select count(*)::int from coupon_ledger where order_id='00000000-bbbb-0000-0000-000000000005' and entry_type='REFUND'), 0, '레거시 취소: REFUND 없음(무근거 환급 방지)');

-- ============ 신 전이: ARRIVED→COMPLETED (CONFIRM) ============
-- 11) rE가 O6 완주
select fn_transition_order('00000000-bbbb-0000-0000-000000000006','ACCEPT','77777777-7777-7777-7777-777777777777','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000006','ARRIVE','77777777-7777-7777-7777-777777777777','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000006','SUBMIT_MEASURE','77777777-7777-7777-7777-777777777777','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select fn_transition_order('00000000-bbbb-0000-0000-000000000006','CONFIRM_MEASURE','11111111-1111-1111-1111-111111111111','supplier');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000006'), 'COMPLETED', 'ARRIVED→COMPLETED(CONFIRM_MEASURE)');
select is((select cash_paid_amount from pickup_orders where id='00000000-bbbb-0000-0000-000000000006'), 7000, 'cash = round(10*700) = 7000');

-- ============ DISPUTED→ARRIVED 복귀(RESOLVE) → 재제출 거부 → CONFIRM 완료 ============
-- 12) rF가 O7 계량 후 분쟁
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','ACCEPT','88888888-8888-8888-8888-888888888888','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','ARRIVE','88888888-8888-8888-8888-888888888888','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','SUBMIT_MEASURE','88888888-8888-8888-8888-888888888888','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','DISPUTE','11111111-1111-1111-1111-111111111111','supplier','{"reason":"무게 이의"}'::jsonb);
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000007'), 'DISPUTED', 'ARRIVED→DISPUTED');
-- admin 중재: kg만 확정, ARRIVED 복귀
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','RESOLVE_DISPUTE',null,'admin','{"finalKg":8.0}'::jsonb);
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000007'), 'ARRIVED', 'RESOLVE_DISPUTE → ARRIVED 복귀(COMPLETED 아님)');
select is((select final_kg from pickup_orders where id='00000000-bbbb-0000-0000-000000000007'), 8.0, '중재 final_kg 8.0 고정');
-- 중재 완료 주문은 SUBMIT_MEASURE 재제출 거부
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000007','SUBMIT_MEASURE','88888888-8888-8888-8888-888888888888','rider','{"measuredKg":9.0,"photoUrls":["https://x/p.jpg"]}'::jsonb) $$,
  'INVALID_TRANSITION', '중재 완료 주문 SUBMIT_MEASURE 재제출 거부');
-- 일반 CONFIRM_MEASURE로 완료(중재 kg 기준)
select fn_transition_order('00000000-bbbb-0000-0000-000000000007','CONFIRM_MEASURE','11111111-1111-1111-1111-111111111111','supplier');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000007'), 'COMPLETED', '중재 후 CONFIRM_MEASURE → COMPLETED');
select is((select cash_paid_amount from pickup_orders where id='00000000-bbbb-0000-0000-000000000007'), 5600, 'cash = round(중재 8.0*700) = 5600');

-- ============ FORCE_COMPLETE (D6) ============
-- 13) rG가 O8: 계량 없으면 거부, memo 없으면 거부, 있으면 완료
select fn_transition_order('00000000-bbbb-0000-0000-000000000008','ACCEPT','99999999-9999-9999-9999-999999999999','rider');
select fn_transition_order('00000000-bbbb-0000-0000-000000000008','ARRIVE','99999999-9999-9999-9999-999999999999','rider');
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000008','FORCE_COMPLETE',null,'admin','{"memo":"교착"}'::jsonb) $$,
  'VALIDATION_ERROR', 'FORCE_COMPLETE: 계량/중재 kg 없으면 거부');
select fn_transition_order('00000000-bbbb-0000-0000-000000000008','SUBMIT_MEASURE','99999999-9999-9999-9999-999999999999','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000008','FORCE_COMPLETE',null,'admin','{}'::jsonb) $$,
  'VALIDATION_ERROR', 'FORCE_COMPLETE: memo 없으면 거부');
select fn_transition_order('00000000-bbbb-0000-0000-000000000008','FORCE_COMPLETE',null,'admin','{"memo":"점주 확인 방치 — 관리자 완료"}'::jsonb);
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000008'), 'COMPLETED', 'FORCE_COMPLETE(계량+memo) → COMPLETED');
select is((select cash_paid_amount from pickup_orders where id='00000000-bbbb-0000-0000-000000000008'), 7000, 'FORCE_COMPLETE cash = round(10*700) = 7000');

-- ============ 쿠폰 부족 ACCEPT 롤백 ============
-- 14) rH(잔액 0)가 O9 수락 → INSUFFICIENT_COUPON, 주문 REQUESTED 잔존
select throws_ok(
  $$ select fn_transition_order('00000000-bbbb-0000-0000-000000000009','ACCEPT','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','rider') $$,
  'INSUFFICIENT_COUPON', '잔액 0 라이더 ACCEPT → INSUFFICIENT_COUPON');
select is((select status from pickup_orders where id='00000000-bbbb-0000-0000-000000000009'), 'REQUESTED', '쿠폰 부족 ACCEPT 롤백: O9 REQUESTED 잔존');

select * from finish();
rollback;

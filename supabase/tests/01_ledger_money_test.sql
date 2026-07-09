-- pgTAP: 신모델(수거쿠폰 피벗) 자금 불변식 (00-domain.md 상태머신 + 쿠폰 원장 규칙, 07 F3a).
-- 주문 1건 완주(ACCEPT→ARRIVE→SUBMIT_MEASURE→CONFIRM_MEASURE) 동안:
--   - CONFIRM_MEASURE는 COMPLETED 직행 + cash_paid_amount=round(final_kg×snapshot_price) + completed_at,
--     EARN/HOLD 신규 발행 없음(신모델).
--   - 쿠폰 원장: CHARGE 멱등(purchase_id unique), CONSUME=coupon_cost, 잔액 부족 예외, CONSUME 멱등,
--     ADJUST 음수 잔액 방어, append-only 트리거.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

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
-- 신 주문(coupon_cost 3 = ceil(45/15)). O2는 잔액 부족 소진 테스트용.
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('00000000-aaaa-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,3),
  ('00000000-aaaa-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,3);
-- CHARGE 멱등 테스트용 구매 건.
insert into coupon_purchases (id, rider_id, qty, unit_price, amount, pg_order_id, status) values
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','22222222-2222-2222-2222-222222222222',10,500,5000,'pg1','PENDING');

-- ── 쿠폰 충전(CHARGE) + 멱등 ─────────────────────────────────────────────
select fn_charge_coupon('22222222-2222-2222-2222-222222222222',10,500,'cccccccc-cccc-cccc-cccc-cccccccccc01','충전',null);
select fn_charge_coupon('22222222-2222-2222-2222-222222222222',10,500,'cccccccc-cccc-cccc-cccc-cccccccccc01','충전 재시도',null);
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 10, 'CHARGE 10 (재시도 멱등: 잔액 10 유지)');
select is((select count(*)::int from coupon_ledger where purchase_id='cccccccc-cccc-cccc-cccc-cccccccccc01' and entry_type='CHARGE'), 1, 'CHARGE 멱등: purchase_id unique로 1행만');

-- ── ACCEPT: 쿠폰 CONSUME(-coupon_cost) ───────────────────────────────────
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','ACCEPT','22222222-2222-2222-2222-222222222222','rider');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 7, 'ACCEPT 후 잔액 = 10 - coupon_cost(3) = 7');
select is((select qty from coupon_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='CONSUME'), -3, 'CONSUME qty = -coupon_cost(3)');

-- ── 완주 → COMPLETED 직행(EARN/HOLD 없음) ────────────────────────────────
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','ARRIVE','22222222-2222-2222-2222-222222222222','rider');
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','SUBMIT_MEASURE','22222222-2222-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select fn_transition_order('00000000-aaaa-0000-0000-000000000001','CONFIRM_MEASURE','11111111-1111-1111-1111-111111111111','supplier');

select is((select status from pickup_orders where id='00000000-aaaa-0000-0000-000000000001'), 'COMPLETED', 'CONFIRM_MEASURE 후 COMPLETED 직행(PICKED_UP 생략)');
select is((select cash_paid_amount from pickup_orders where id='00000000-aaaa-0000-0000-000000000001'), 31500, 'cash_paid_amount = round(45.0*700) = 31500');
select ok((select completed_at is not null from pickup_orders where id='00000000-aaaa-0000-0000-000000000001'), 'completed_at 기록됨');
select is((select count(*)::int from point_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='EARN'), 0, 'EARN 신규 발행 없음(신모델)');
select is((select count(*)::int from point_ledger where order_id='00000000-aaaa-0000-0000-000000000001' and entry_type='HOLD'), 0, 'HOLD 신규 발행 없음(신모델)');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 7, 'CONFIRM_MEASURE는 쿠폰 잔액 불변(7)');

-- ── CONSUME 멱등(이미 소진된 주문 재소진 → 잔액 불변) ────────────────────
select fn_consume_coupon('22222222-2222-2222-2222-222222222222','00000000-aaaa-0000-0000-000000000001',3);
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 7, 'CONSUME 멱등: 재호출해도 잔액 7 유지');

-- ── append-only ──────────────────────────────────────────────────────────
select throws_ok(
  $$ update coupon_ledger set qty = 0 where order_id='00000000-aaaa-0000-0000-000000000001' $$,
  'coupon_ledger is append-only', 'coupon_ledger UPDATE는 append-only 트리거로 차단');

-- ── 잔액 부족 소진 예외 ────────────────────────────────────────────────────
select throws_ok(
  $$ select fn_consume_coupon('22222222-2222-2222-2222-222222222222','00000000-aaaa-0000-0000-000000000002',100) $$,
  'INSUFFICIENT_COUPON', '잔액(7) < 소진(100) → INSUFFICIENT_COUPON');

-- ── ADJUST 음수: 잔액 내 차감 OK, 잔액 초과 차감 방어 ──────────────────────
select fn_charge_coupon('22222222-2222-2222-2222-222222222222',-2,null,null,'회수',null);
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 5, 'ADJUST -2 후 잔액 5');
select throws_ok(
  $$ select fn_charge_coupon('22222222-2222-2222-2222-222222222222',-100,null,null,'과회수',null) $$,
  'INSUFFICIENT_COUPON', 'ADJUST 음수가 잔액(5) 초과 → INSUFFICIENT_COUPON');

select * from finish();
rollback;

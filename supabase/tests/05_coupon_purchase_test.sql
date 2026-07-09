-- pgTAP: PG 결제(토스페이먼츠) 확정·환불 RPC 불변식 (07 F4, 20260709000005_rpc_purchase.sql).
--   fn_confirm_purchase: PENDING→PAID + CHARGE 충전, 이중 confirm 멱등(이중 충전 없음),
--                        non-PENDING 확정 거부.
--   fn_refund_purchase : PAID만 환불(건당 1회), 환불 qty ≤ 구매 qty, 미사용 잔액 부족 거부,
--                        ADJUST(-qty, purchase_id, unit_price 스냅샷) 기록, status=REFUNDED.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(21);

-- ── 픽스처(트리거 예외 role인 postgres로 삽입) ──────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid@p.local',now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rid2@p.local',now(),now()),
  ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm@p.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('22222222-2222-2222-2222-222222222222','rider','011','라이더'),
  ('33333333-3333-3333-3333-333333333333','rider','012','라이더2'),
  ('99999999-9999-9999-9999-999999999999','admin','019','관리자');
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('22222222-2222-2222-2222-222222222222','b','12가1234','APPROVED'),
  ('33333333-3333-3333-3333-333333333333','b','34나5678','APPROVED');

-- 구매 건: P1(confirm/refund 대상), P3(R2 잔액부족 대상), P4(FAILED 확정거부), P5(PENDING 환불거부).
insert into coupon_purchases (id, rider_id, qty, unit_price, amount, pg_order_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','22222222-2222-2222-2222-222222222222',10,500,5000,'oc_p1','PENDING'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3','33333333-3333-3333-3333-333333333333', 5,500,2500,'oc_p3','PENDING'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4','22222222-2222-2222-2222-222222222222', 2,500,1000,'oc_p4','PENDING'),
  ('aaaaaaaa-0000-0000-0000-0000000000a5','22222222-2222-2222-2222-222222222222', 3,500,1500,'oc_p5','PENDING');

-- ════════════════ fn_confirm_purchase ════════════════
-- ── PENDING→PAID + CHARGE 충전 ────────────────────────────────────────────
select fn_confirm_purchase('aaaaaaaa-0000-0000-0000-0000000000a1','tk_p1');
select is((select status::text from coupon_purchases where id='aaaaaaaa-0000-0000-0000-0000000000a1'), 'PAID', 'confirm: PENDING→PAID 전이');
select is((select payment_key from coupon_purchases where id='aaaaaaaa-0000-0000-0000-0000000000a1'), 'tk_p1', 'confirm: payment_key 기록');
select is((select qty from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='CHARGE'), 10, 'confirm: CHARGE qty = 구매 qty(10)');
select is((select unit_price from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='CHARGE'), 500, 'confirm: CHARGE unit_price = 구매 단가 스냅샷(500)');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 10, 'confirm 후 잔액 = 10');

-- ── 이중 confirm 멱등(이중 충전 없음) ────────────────────────────────────
select fn_confirm_purchase('aaaaaaaa-0000-0000-0000-0000000000a1','tk_p1');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 10, '이중 confirm: 잔액 10 유지(멱등)');
select is((select count(*)::int from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='CHARGE'), 1, '이중 confirm: CHARGE 1행만(purchase_id unique)');

-- ════════════════ fn_refund_purchase ════════════════
-- ── 환불 qty > 구매 qty 거부(전이 없음) ──────────────────────────────────
select throws_ok(
  $$ select fn_refund_purchase('aaaaaaaa-0000-0000-0000-0000000000a1', 999, '99999999-9999-9999-9999-999999999999', 'over') $$,
  'VALIDATION_ERROR', 'refund: 환불 qty(999) > 구매 qty(10) → VALIDATION_ERROR');
select is((select status::text from coupon_purchases where id='aaaaaaaa-0000-0000-0000-0000000000a1'), 'PAID', '거부된 과다환불 후 status PAID 유지');

-- ── 부분 환불(PAID만 허용): ADJUST(-qty, purchase_id, unit_price 스냅샷) + REFUNDED ──────
select fn_refund_purchase('aaaaaaaa-0000-0000-0000-0000000000a1', 4, '99999999-9999-9999-9999-999999999999', 'CS 부분환불');
select is((select qty from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='ADJUST'), -4, 'refund: ADJUST qty = -환불(4)');
select is((select unit_price from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='ADJUST'), 500, 'refund: ADJUST unit_price = 구매 건 스냅샷(500)');
select is((select count(*)::int from coupon_ledger where purchase_id='aaaaaaaa-0000-0000-0000-0000000000a1' and entry_type='ADJUST'), 1, 'refund: purchase_id 있는 ADJUST 기록(PG 환불 구분)');
select is((select status::text from coupon_purchases where id='aaaaaaaa-0000-0000-0000-0000000000a1'), 'REFUNDED', 'refund: status=REFUNDED');
select is((select balance from v_coupon_balance where rider_id='22222222-2222-2222-2222-222222222222'), 6, 'refund 후 잔액 = 10 - 4 = 6');

-- ── 건당 1회: 이미 REFUNDED 재환불 거부 ──────────────────────────────────
select throws_ok(
  $$ select fn_refund_purchase('aaaaaaaa-0000-0000-0000-0000000000a1', 4, '99999999-9999-9999-9999-999999999999', '재환불') $$,
  'INVALID_TRANSITION', 'refund: REFUNDED 재환불 → INVALID_TRANSITION(건당 1회)');

-- ── PENDING(미확정) 환불 거부 ─────────────────────────────────────────────
select throws_ok(
  $$ select fn_refund_purchase('aaaaaaaa-0000-0000-0000-0000000000a5', 3, '99999999-9999-9999-9999-999999999999', 'pending') $$,
  'INVALID_TRANSITION', 'refund: PENDING(미확정) 건 환불 → INVALID_TRANSITION');

-- ── FAILED 건 확정 거부 ──────────────────────────────────────────────────
update coupon_purchases set status='FAILED' where id='aaaaaaaa-0000-0000-0000-0000000000a4';
select throws_ok(
  $$ select fn_confirm_purchase('aaaaaaaa-0000-0000-0000-0000000000a4', 'tk_p4') $$,
  'INVALID_TRANSITION', 'confirm: FAILED 건 확정 → INVALID_TRANSITION');

-- ── 미사용 잔액 부족 환불 거부(rider FOR UPDATE 직렬화 후 재계산) ──────────
select fn_confirm_purchase('aaaaaaaa-0000-0000-0000-0000000000a3','tk_p3');
select is((select balance from v_coupon_balance where rider_id='33333333-3333-3333-3333-333333333333'), 5, 'R2 confirm 후 잔액 = 5');
-- 잔액 전량 소진(음수 ADJUST, purchase_id null) → 미사용 잔액 0.
select fn_charge_coupon('33333333-3333-3333-3333-333333333333',-5,null,null,'전량 사용',null);
select is((select balance from v_coupon_balance where rider_id='33333333-3333-3333-3333-333333333333'), 0, 'R2 소진 후 잔액 = 0');
select throws_ok(
  $$ select fn_refund_purchase('aaaaaaaa-0000-0000-0000-0000000000a3', 5, '99999999-9999-9999-9999-999999999999', '잔액부족') $$,
  'INSUFFICIENT_COUPON', 'refund: 미사용 잔액(0) < 환불(5) → INSUFFICIENT_COUPON');
select is((select status::text from coupon_purchases where id='aaaaaaaa-0000-0000-0000-0000000000a3'), 'PAID', '거부된 환불 후 P3 status PAID 유지(롤백 증명)');

select * from finish();
rollback;

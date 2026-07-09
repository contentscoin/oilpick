-- pgTAP: 레거시 주문 회귀 (07 F3a-③, §0 프로덕션 전제 + D1 보강 2026-07-09). 신모델 배포 후에도
-- 프로덕션에 잔존할 수 있는 구 경로(PICKED_UP 상태 주문의 집하장 배송·QR 검증)가 완결은 되지만
-- **라이더에게 어떤 포인트도 지급하지 않음**을 검증한다(RELEASE 발행 제거 — 20260709000010.
-- 라이더는 쿠폰을 구매하는 쪽이지 지급받는 쪽이 아니다).
-- 신 상태머신은 PICKED_UP에 도달하지 않으므로 픽스처는 PICKED_UP 주문을 직접 삽입한다.
create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

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

-- 레거시 주문: 신모델 게이트 활성 전 생성돼 이미 PICKED_UP에 도달한 잔존분(coupon_cost null).
-- EARN(supplier)/HOLD(rider)는 구 CONFIRM_MEASURE 시점에 이미 발행돼 있던 상태를 재현.
insert into pickup_orders (id, supplier_id, rider_id, status, requested_kg, pickup_address, pickup_location,
    snapshot_price_per_kg, snapshot_rider_fee, coupon_cost, measured_kg, final_kg, supplier_point, picked_up_at)
  values ('00000000-cccc-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
    'PICKED_UP',45.0,'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography, 700, 5000, null, 45.0, 45.0, 31500, now());
insert into point_ledger (user_id, entry_type, amount, order_id, memo) values
  ('11111111-1111-1111-1111-111111111111','EARN',31500,'00000000-cccc-0000-0000-000000000001','legacy'),
  ('22222222-2222-2222-2222-222222222222','HOLD',5000,'00000000-cccc-0000-0000-000000000001','legacy');

-- ── 레거시 DELIVER(집하장 QR 검증 → COMPLETED, 지급 없음) ────────────────────
select fn_transition_order('00000000-cccc-0000-0000-000000000001','DELIVER','22222222-2222-2222-2222-222222222222','rider',
  '{"depotId":"dddddddd-0000-0000-0000-0000000000d1","qrSecret":"secret-qr-123"}'::jsonb);

select is((select status from pickup_orders where id='00000000-cccc-0000-0000-000000000001'), 'COMPLETED', '레거시 DELIVER 후 COMPLETED');
select is((select count(*)::int from point_ledger where order_id='00000000-cccc-0000-0000-000000000001' and entry_type='RELEASE'),
          0, 'D1 보강: 레거시 완결에도 RELEASE 지급 없음');
select is((select available from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 0, 'D1 보강: available 0(지급 없음)');
select is((select held from v_point_balance where user_id='22222222-2222-2222-2222-222222222222'), 5000, '기존 HOLD는 held에 잔존(과거 회계 기록 — 지급 의무 아님)');
select is((select count(*)::int from coupon_ledger where rider_id='22222222-2222-2222-2222-222222222222'), 0, '레거시 경로는 쿠폰 원장을 건드리지 않음');

-- 멱등: 완료된 주문 DELIVER 재호출 거부(포인트 미발행은 위에서 검증)
select throws_ok(
  $$ select fn_transition_order('00000000-cccc-0000-0000-000000000001','DELIVER','22222222-2222-2222-2222-222222222222','rider','{"depotId":"dddddddd-0000-0000-0000-0000000000d1","qrSecret":"secret-qr-123"}'::jsonb) $$,
  'INVALID_TRANSITION', '완료된 레거시 주문 DELIVER 재호출은 INVALID_TRANSITION');

select * from finish();
rollback;

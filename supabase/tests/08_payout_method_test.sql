-- pgTAP: 08 피벗 — 현장 지급수단(현금·포인트) 불변식 (docs/spec/08-payout-pivot.md P1~P4).
--   - P1: 신규 주문(coupon_cost null)은 쿠폰 잔액 0으로도 ACCEPT 가능(게이트 소멸), 쿠폰 원장 무변경.
--   - P2: SUBMIT_MEASURE payoutMethod 검증(CASH|POINT만), 재제출로 수단 변경 가능, 생략 시 CASH 폴백.
--   - P3: CONFIRM_MEASURE/FORCE_COMPLETE — POINT면 supplier EARN 정확히 1행(멱등), CASH면 원장 무변경.
--   - P4: 출금 왕복 — 신청 시 즉시 차감, 반려 시 WITHDRAW_CANCEL 복구.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(23);

-- ── 픽스처 ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('11111111-0808-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s8@t',now(),now()),
  ('22222222-0808-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r8a@t',now(),now()),
  ('33333333-0808-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r8b@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('11111111-0808-1111-1111-111111111111','supplier','0108','공급8'),
  ('22222222-0808-2222-2222-222222222222','rider','0118','라이더8A'),
  ('33333333-0808-3333-3333-333333333333','rider','0128','라이더8B');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('11111111-0808-1111-1111-111111111111','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('22222222-0808-2222-2222-222222222222','b','88가8801','APPROVED'),
  ('33333333-0808-3333-3333-333333333333','b','88가8802','APPROVED')
  on conflict (id) do nothing;

-- 신규 주문 4건 — 전부 coupon_cost null(08 P1: order-create가 스냅샷 중지). 45kg, 시세 700.
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg) values
  ('00000000-0808-0000-0000-000000000001','11111111-0808-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700),
  ('00000000-0808-0000-0000-000000000002','11111111-0808-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700),
  ('00000000-0808-0000-0000-000000000003','11111111-0808-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700),
  ('00000000-0808-0000-0000-000000000004','11111111-0808-1111-1111-111111111111','REQUESTED',45.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700);

-- ============ P1: 쿠폰 게이트 소멸 ============
-- r8A는 쿠폰 원장 행이 하나도 없다 — 잔액 0으로 ACCEPT 성공해야 한다.
select fn_transition_order('00000000-0808-0000-0000-000000000001','ACCEPT','22222222-0808-2222-2222-222222222222','rider');
select is((select status from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 'ACCEPTED',
  'P1: 쿠폰 잔액 0 라이더도 신규 주문(coupon_cost null) 수락 가능');
select is((select count(*)::int from coupon_ledger where rider_id='22222222-0808-2222-2222-222222222222'), 0,
  'P1: 수락해도 쿠폰 원장 무변경(CONSUME 없음)');

-- ============ P2: payoutMethod 검증·변경·기록 ============
select fn_transition_order('00000000-0808-0000-0000-000000000001','ARRIVE','22222222-0808-2222-2222-222222222222','rider');
select throws_ok(
  $$ select fn_transition_order('00000000-0808-0000-0000-000000000001','SUBMIT_MEASURE','22222222-0808-2222-2222-222222222222','rider',
       '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINTS"}'::jsonb) $$,
  'VALIDATION_ERROR', 'P2: payoutMethod는 CASH|POINT만(POINTS 거부)');

-- 명시적 JSON null은 거부하지 않고 CASH 폴백으로 저장(payout_method NULL로 남기지 않음).
select fn_transition_order('00000000-0808-0000-0000-000000000001','SUBMIT_MEASURE','22222222-0808-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":null}'::jsonb);
select is((select payout_method from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 'CASH',
  'P2: payoutMethod 명시적 null → CASH 폴백(NULL 저장 안 함)');

select fn_transition_order('00000000-0808-0000-0000-000000000001','SUBMIT_MEASURE','22222222-0808-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH"}'::jsonb);
select is((select payout_method from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 'CASH',
  'P2: SUBMIT_MEASURE가 payout_method=CASH 기록');

-- 재제출로 수단 변경(중재 확정 전).
select fn_transition_order('00000000-0808-0000-0000-000000000001','SUBMIT_MEASURE','22222222-0808-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb);
select is((select payout_method from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 'POINT',
  'P2: 재제출로 CASH→POINT 변경 가능');

-- ============ P3: POINT 완료 → EARN 정확히 1행 ============
select fn_transition_order('00000000-0808-0000-0000-000000000001','CONFIRM_MEASURE','11111111-0808-1111-1111-111111111111','supplier');
select is((select status from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 'COMPLETED',
  'P3: POINT CONFIRM_MEASURE → COMPLETED');
select is((select cash_paid_amount from pickup_orders where id='00000000-0808-0000-0000-000000000001'), 31500,
  'P3: 확정 지급액 = round(45.0×700) = 31500 (POINT도 cash_paid_amount에 기록)');
select is((select count(*)::int from point_ledger where order_id='00000000-0808-0000-0000-000000000001' and entry_type='EARN'), 1,
  'P3: EARN 정확히 1행');
select is((select amount from point_ledger where order_id='00000000-0808-0000-0000-000000000001' and entry_type='EARN'), 31500,
  'P3: EARN 금액 = 확정 지급액');
select is((select available from v_point_balance where user_id='11111111-0808-1111-1111-111111111111'), 31500,
  'P3: 잔액 뷰 available = 31500');

-- EARN 멱등(재시도 안전): 같은 (order_id, EARN, user_id) 재발행 시도 → 1행 유지.
select fn_post_ledger('11111111-0808-1111-1111-111111111111','EARN',31500,'00000000-0808-0000-0000-000000000001','재시도',null,null);
select is((select count(*)::int from point_ledger where order_id='00000000-0808-0000-0000-000000000001' and entry_type='EARN'), 1,
  'P3: EARN 멱등 — 재시도해도 1행 유지');

-- ============ P3: CASH 완료 → 원장 무변경 ============
select fn_transition_order('00000000-0808-0000-0000-000000000002','ACCEPT','33333333-0808-3333-3333-333333333333','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000002','ARRIVE','33333333-0808-3333-3333-333333333333','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000002','SUBMIT_MEASURE','33333333-0808-3333-3333-333333333333','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH"}'::jsonb);
select fn_transition_order('00000000-0808-0000-0000-000000000002','CONFIRM_MEASURE','11111111-0808-1111-1111-111111111111','supplier');
select is((select status from pickup_orders where id='00000000-0808-0000-0000-000000000002'), 'COMPLETED',
  'P3: CASH CONFIRM_MEASURE → COMPLETED');
select is((select count(*)::int from point_ledger where order_id='00000000-0808-0000-0000-000000000002'), 0,
  'P3: CASH 완료는 point_ledger 무변경');

-- ============ P3: FORCE_COMPLETE(POINT) → EARN ============
select fn_transition_order('00000000-0808-0000-0000-000000000003','ACCEPT','22222222-0808-2222-2222-222222222222','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000003','ARRIVE','22222222-0808-2222-2222-222222222222','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000003','SUBMIT_MEASURE','22222222-0808-2222-2222-222222222222','rider',
  '{"measuredKg":45.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb);
select fn_transition_order('00000000-0808-0000-0000-000000000003','FORCE_COMPLETE',null,'admin','{"memo":"점주 확인 방치"}'::jsonb);
select is((select status from pickup_orders where id='00000000-0808-0000-0000-000000000003'), 'COMPLETED',
  'P3: FORCE_COMPLETE(POINT) → COMPLETED');
select is((select count(*)::int from point_ledger where order_id='00000000-0808-0000-0000-000000000003' and entry_type='EARN'), 1,
  'P3: FORCE_COMPLETE(POINT)도 EARN 1행');
select is((select available from v_point_balance where user_id='11111111-0808-1111-1111-111111111111'), 63000,
  'P3: 누적 available = 31500×2 = 63000');

-- ============ P2: payoutMethod 생략 → CASH 폴백(구버전 호환) ============
select fn_transition_order('00000000-0808-0000-0000-000000000004','ACCEPT','33333333-0808-3333-3333-333333333333','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000004','ARRIVE','33333333-0808-3333-3333-333333333333','rider');
select fn_transition_order('00000000-0808-0000-0000-000000000004','SUBMIT_MEASURE','33333333-0808-3333-3333-333333333333','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"]}'::jsonb);
select is((select payout_method from pickup_orders where id='00000000-0808-0000-0000-000000000004'), 'CASH',
  'P2: payoutMethod 생략 시 CASH 폴백');

-- ============ P4: 출금 왕복 ============
select fn_request_withdraw('11111111-0808-1111-1111-111111111111', 20000, '국민', '123-456', '공급8');
select is((select status from withdrawals where user_id='11111111-0808-1111-1111-111111111111' order by created_at desc limit 1),
  'REQUESTED', 'P4: 출금 신청 → REQUESTED');
select is((select available from v_point_balance where user_id='11111111-0808-1111-1111-111111111111'), 42000,
  'P4: 신청 즉시 차감 — available 63000-20000-1000(수수료, 08 Q1)=42000');
select fn_process_withdraw(
  (select id from withdrawals where user_id='11111111-0808-1111-1111-111111111111' order by created_at desc limit 1),
  'REJECTED', null, '계좌 오류');
select is((select status from withdrawals where user_id='11111111-0808-1111-1111-111111111111' order by created_at desc limit 1),
  'REJECTED', 'P4: 반려 처리 → REJECTED');
select is((select available from v_point_balance where user_id='11111111-0808-1111-1111-111111111111'), 63000,
  'P4: WITHDRAW_CANCEL 복구 — available 63000 원복');

-- 잔액 초과 신청 방어(기존 자산 회귀).
select throws_ok(
  $$ select fn_request_withdraw('11111111-0808-1111-1111-111111111111', 999999, '국민', '123-456', '공급8') $$,
  'INSUFFICIENT_BALANCE', 'P4: 잔액 초과 출금 신청 → INSUFFICIENT_BALANCE');

select * from finish();
rollback;

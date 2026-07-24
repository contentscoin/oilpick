-- pgTAP: 14 J3 좌상 정산 체인 — dealer_id 스냅샷·재배정 불변·크레딧 게이트·청구/정산/무효·집계.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(20);

-- ── 픽스처: 좌상 3 + 라이더 3(D1소속2·미배정1) + 점주 + admin ──
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('dc000000-0000-0000-0000-000000000001'::uuid),('dc000000-0000-0000-0000-000000000002'::uuid),
  ('dc000000-0000-0000-0000-000000000003'::uuid),('dc000000-0000-0000-0000-000000000101'::uuid),
  ('dc000000-0000-0000-0000-000000000102'::uuid),('dc000000-0000-0000-0000-000000000103'::uuid),
  ('dc000000-0000-0000-0000-000000000201'::uuid),('dc000000-0000-0000-0000-000000000301'::uuid)
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('dc000000-0000-0000-0000-000000000001','dealer','0','좌상1'),
  ('dc000000-0000-0000-0000-000000000002','dealer','0','좌상2'),
  ('dc000000-0000-0000-0000-000000000003','dealer','0','좌상3'),
  ('dc000000-0000-0000-0000-000000000101','rider','0','R1'),
  ('dc000000-0000-0000-0000-000000000102','rider','0','R2'),
  ('dc000000-0000-0000-0000-000000000103','rider','0','R3'),
  ('dc000000-0000-0000-0000-000000000201','supplier','0','점주'),
  ('dc000000-0000-0000-0000-000000000301','admin','0','관리자');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('dc000000-0000-0000-0000-000000000201','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, dealer_id) values
  ('dc000000-0000-0000-0000-000000000101','b','01','APPROVED','dc000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000102','b','02','APPROVED','dc000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000103','b','03','APPROVED',null)
  on conflict (id) do nothing;
insert into dealer_accounts (dealer_id, deposit_amount, credit_limit, claim_threshold, fee_rate_bp) values
  ('dc000000-0000-0000-0000-000000000001', 0, 10000, 5000, 0),
  ('dc000000-0000-0000-0000-000000000002', 0, 99999999, 5000, 100),  -- fee 1%
  ('dc000000-0000-0000-0000-000000000003', 0, 99999999, 5000, 0);

-- ============ (1) dealer_id ACCEPT 스냅샷 트리거 ============
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
values ('dc000000-0000-0000-0000-000000000401','dc000000-0000-0000-0000-000000000201','REQUESTED',10,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700);
select fn_transition_order('dc000000-0000-0000-0000-000000000401','ACCEPT','dc000000-0000-0000-0000-000000000101','rider');
select is((select dealer_id from pickup_orders where id='dc000000-0000-0000-0000-000000000401'),
  'dc000000-0000-0000-0000-000000000001'::uuid, 'ACCEPT가 rider 소속 좌상(D1)을 주문에 스냅샷');

-- ============ (2) 재배정 귀속 불변(스냅샷 고정) ============
update rider_profiles set dealer_id='dc000000-0000-0000-0000-000000000002' where id='dc000000-0000-0000-0000-000000000101';
select is((select dealer_id from pickup_orders where id='dc000000-0000-0000-0000-000000000401'),
  'dc000000-0000-0000-0000-000000000001'::uuid, '라이더 재배정(D1→D2) 후에도 과거 주문 dealer_id는 D1 불변');
-- 원복(이후 테스트 영향 방지)
update rider_profiles set dealer_id='dc000000-0000-0000-0000-000000000001' where id='dc000000-0000-0000-0000-000000000101';

-- ============ (3) 크레딧 게이트: 한도 초과 CONFIRM 거부 ============
-- D1 한도 10000. 기존 미정산 COMPLETED 주문(net 6000) 직삽입 → baseline usage 6000.
insert into pickup_orders (id, supplier_id, rider_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, payout_method, cash_paid_amount, purchase_amount, net_amount, final_kg)
values ('dc000000-0000-0000-0000-000000000402','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000101','dc000000-0000-0000-0000-000000000001','COMPLETED',6,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'POINT',6000,0,6000,6);
-- 게이트 대상 주문(ARRIVED, dealer_id=D1 직접, net 6000 예정) — CONFIRM 시 usage 6000+6000=12000>10000.
insert into pickup_orders (id, supplier_id, rider_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
values ('dc000000-0000-0000-0000-000000000403','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000102','dc000000-0000-0000-0000-000000000001','ARRIVED',6,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000);
select fn_transition_order('dc000000-0000-0000-0000-000000000403','SUBMIT_MEASURE','dc000000-0000-0000-0000-000000000102','rider','{"measuredKg":6.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb);
select throws_ok(
  $$ select fn_transition_order('dc000000-0000-0000-0000-000000000403','CONFIRM_MEASURE','dc000000-0000-0000-0000-000000000201','supplier') $$,
  'DEALER_LIMIT_EXCEEDED', '한도 초과 CONFIRM → DEALER_LIMIT_EXCEEDED');
select is((select status from pickup_orders where id='dc000000-0000-0000-0000-000000000403'), 'ARRIVED', '게이트 거부: 롤백되어 ARRIVED 유지');

-- ============ (4) 본사 직속(dealer null) 무게이트 ============
insert into pickup_orders (id, supplier_id, rider_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
values ('dc000000-0000-0000-0000-000000000404','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000103',null,'ARRIVED',100,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000);
select fn_transition_order('dc000000-0000-0000-0000-000000000404','SUBMIT_MEASURE','dc000000-0000-0000-0000-000000000103','rider','{"measuredKg":100.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb);
select fn_transition_order('dc000000-0000-0000-0000-000000000404','CONFIRM_MEASURE','dc000000-0000-0000-0000-000000000201','supplier');
select is((select status from pickup_orders where id='dc000000-0000-0000-0000-000000000404'), 'COMPLETED', '본사 직속: 한도 무관 완료(무게이트)');
select is((select amount from point_ledger where order_id='dc000000-0000-0000-0000-000000000404' and entry_type='EARN'), 100000, '본사 직속: EARN 100000');

-- ============ (5) 청구 생성: 집계·fee·스탬핑 (D2, fee 1%) ============
insert into pickup_orders (id, supplier_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, payout_method, cash_paid_amount, purchase_amount, net_amount, final_kg) values
  ('dc000000-0000-0000-0000-000000000501','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000002','COMPLETED',5,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'POINT',5000,0,5000,5),
  ('dc000000-0000-0000-0000-000000000502','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000002','COMPLETED',1,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'POINT',1000,3000,-2000,1);
select is((select usage from v_dealer_statement where dealer_id='dc000000-0000-0000-0000-000000000002'), 3000, 'D2 청구 전 usage = minted5000 − spent2000 = 3000');
select fn_create_dealer_claim('dc000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000301');
select is((select point_minted from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), 5000, '청구 point_minted=5000');
select is((select point_spent from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), 2000, '청구 point_spent=2000');
select is((select fee_amount from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), 60, '청구 fee = round((5000+1000)×100/10000)=60');
select is((select net_due from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), 3060, '청구 net_due = 5000−2000+60 = 3060');
select is((select dealer_settlement_id from pickup_orders where id='dc000000-0000-0000-0000-000000000501'),
  (select id from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), '대상 주문 스탬핑(settlement_id 부여)');
select is((select usage from v_dealer_statement where dealer_id='dc000000-0000-0000-0000-000000000002'), 0, '청구 후 usage=0(윈도우 리셋)');

-- ============ (6) 정산 마킹 멱등 + 청구 대상 없음 거부 ============
select fn_settle_dealer_claim((select id from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'),'dc000000-0000-0000-0000-000000000301');
select is((select status from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'), 'SETTLED', '정산 마킹 → SETTLED');
select lives_ok(
  $$ select fn_settle_dealer_claim((select id from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002'),'dc000000-0000-0000-0000-000000000301') $$,
  '정산 마킹 재호출 멱등(no-op)');
select throws_ok(
  $$ select fn_create_dealer_claim('dc000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000301') $$,
  'NOT_FOUND', '미정산 주문 없으면 청구 생성 NOT_FOUND');

-- ============ (7) 무효: 스탬프 해제 → 풀 복귀, SETTLED 무효 불가 ============
insert into pickup_orders (id, supplier_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, payout_method, cash_paid_amount, purchase_amount, net_amount, final_kg)
values ('dc000000-0000-0000-0000-000000000503','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000002','COMPLETED',1,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'POINT',1000,0,1000,1);
select fn_create_dealer_claim('dc000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000301');
select fn_void_dealer_claim((select id from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002' and status='CLAIMED'),'dc000000-0000-0000-0000-000000000301');
select is((select dealer_settlement_id from pickup_orders where id='dc000000-0000-0000-0000-000000000503'), null::uuid, '무효: 스탬프 해제되어 주문이 미정산 풀로 복귀');
select throws_ok(
  $$ select fn_void_dealer_claim((select id from dealer_settlements where dealer_id='dc000000-0000-0000-0000-000000000002' and status='SETTLED'),'dc000000-0000-0000-0000-000000000301') $$,
  'INVALID_TRANSITION', 'SETTLED 청구는 무효화 불가');

-- ============ (8) v_dealer_statement over_threshold ============
insert into pickup_orders (id, supplier_id, dealer_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, payout_method, cash_paid_amount, purchase_amount, net_amount, final_kg)
values ('dc000000-0000-0000-0000-000000000601','dc000000-0000-0000-0000-000000000201','dc000000-0000-0000-0000-000000000003','COMPLETED',6,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'POINT',6000,0,6000,6);
select is((select over_threshold from v_dealer_statement where dealer_id='dc000000-0000-0000-0000-000000000003'), true, 'usage 6000 ≥ 임계 5000 → over_threshold true');

select * from finish();
rollback;

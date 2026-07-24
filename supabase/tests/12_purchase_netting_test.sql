-- pgTAP: 14 J2 신유 구매·현장 상계 코어 — fn_settle_trade 넷팅.
--   net 3부호(양/영/음) × CASH/POINT, 포인트 부족 롤백, 레거시(PICKUP) 회귀,
--   deliveredCans 필수(구매 동반), measuredKg 게이트(순수 수거 >0 / 구매-only 0 허용).
--   cash_paid_amount 동결(폐유 총액) + purchase_amount/net_amount 기록을 검증한다.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

-- ── 픽스처: 시나리오별 supplier/rider(단일 활성주문 제약 회피 위해 라이더 분리) ──
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', id::text || '@t', now(), now()
from (values
  ('fb000000-0000-0000-0000-000000000001'::uuid),('fb000000-0000-0000-0000-000000000002'::uuid),
  ('fb000000-0000-0000-0000-000000000003'::uuid),('fb000000-0000-0000-0000-000000000004'::uuid),
  ('fb000000-0000-0000-0000-000000000005'::uuid),('fb000000-0000-0000-0000-000000000006'::uuid),
  ('fb000000-0000-0000-0000-000000000007'::uuid),('fb000000-0000-0000-0000-000000000008'::uuid),
  ('fb000000-0000-0000-0000-000000000009'::uuid),
  ('fb000000-0000-0000-0000-000000000101'::uuid),('fb000000-0000-0000-0000-000000000102'::uuid),
  ('fb000000-0000-0000-0000-000000000103'::uuid),('fb000000-0000-0000-0000-000000000104'::uuid),
  ('fb000000-0000-0000-0000-000000000105'::uuid),('fb000000-0000-0000-0000-000000000106'::uuid),
  ('fb000000-0000-0000-0000-000000000107'::uuid),('fb000000-0000-0000-0000-000000000108'::uuid),
  ('fb000000-0000-0000-0000-000000000109'::uuid)
) as v(id);

insert into profiles (id, role, phone, display_name)
select id, 'supplier', '0', 's' from (values
  ('fb000000-0000-0000-0000-000000000001'::uuid),('fb000000-0000-0000-0000-000000000002'::uuid),
  ('fb000000-0000-0000-0000-000000000003'::uuid),('fb000000-0000-0000-0000-000000000004'::uuid),
  ('fb000000-0000-0000-0000-000000000005'::uuid),('fb000000-0000-0000-0000-000000000006'::uuid),
  ('fb000000-0000-0000-0000-000000000007'::uuid),('fb000000-0000-0000-0000-000000000008'::uuid),
  ('fb000000-0000-0000-0000-000000000009'::uuid)
) as v(id);
insert into profiles (id, role, phone, display_name)
select id, 'rider', '0', 'r' from (values
  ('fb000000-0000-0000-0000-000000000101'::uuid),('fb000000-0000-0000-0000-000000000102'::uuid),
  ('fb000000-0000-0000-0000-000000000103'::uuid),('fb000000-0000-0000-0000-000000000104'::uuid),
  ('fb000000-0000-0000-0000-000000000105'::uuid),('fb000000-0000-0000-0000-000000000106'::uuid),
  ('fb000000-0000-0000-0000-000000000107'::uuid),('fb000000-0000-0000-0000-000000000108'::uuid),
  ('fb000000-0000-0000-0000-000000000109'::uuid)
) as v(id);

insert into supplier_profiles (id, biz_number, store_name, address, location)
select id, 'b', 's', 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography from profiles where role='supplier' and id::text like 'fb%';
insert into rider_profiles (id, biz_number, vehicle_number, verify_status)
select id, 'b', '00가'||right(id::text,3), 'APPROVED' from profiles where role='rider' and id::text like 'fb%'
  on conflict (id) do nothing;

-- 공통 주문 삽입 헬퍼 대신 직접 insert(ARRIVED에서 시작). 시세 700(별도 명시 케이스 제외).
insert into pickup_orders
  (id, supplier_id, rider_id, status, requested_kg, pickup_address, pickup_location,
   snapshot_price_per_kg, order_kind, purchase_requested_cans, snapshot_fresh_can_price)
values
  -- 1) MIXED POINT net>0: 10kg×700=7000 − 1통×2000=2000 → +5000
  ('fb000000-0000-0000-0000-000000000201','fb000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000101','ARRIVED',10,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'MIXED',1,2000),
  -- 2) MIXED POINT net<0: 1kg×700=700 − 2통×2000=4000 → −3300
  ('fb000000-0000-0000-0000-000000000202','fb000000-0000-0000-0000-000000000002','fb000000-0000-0000-0000-000000000102','ARRIVED',1,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'MIXED',2,2000),
  -- 3) MIXED POINT net=0: 2kg×1000=2000 − 1통×2000=2000 → 0
  ('fb000000-0000-0000-0000-000000000203','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000103','ARRIVED',2,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,1000,'MIXED',1,2000),
  -- 4) MIXED CASH: 7000 − 2000 = 5000 (원장 무기록)
  ('fb000000-0000-0000-0000-000000000204','fb000000-0000-0000-0000-000000000004','fb000000-0000-0000-0000-000000000104','ARRIVED',10,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'MIXED',1,2000),
  -- 5) 포인트 부족: 1kg×700=700 − 3통×2000=6000 → −5300 (잔액 1000)
  ('fb000000-0000-0000-0000-000000000205','fb000000-0000-0000-0000-000000000005','fb000000-0000-0000-0000-000000000105','ARRIVED',1,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'MIXED',3,2000),
  -- 6) 레거시 PICKUP POINT: order_kind null, 10kg×700=7000 → +7000 (구매 성분 0)
  ('fb000000-0000-0000-0000-000000000206','fb000000-0000-0000-0000-000000000006','fb000000-0000-0000-0000-000000000106','ARRIVED',10,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,null,null,null),
  -- 7) PURCHASE: deliveredCans 누락 제출 거부
  ('fb000000-0000-0000-0000-000000000207','fb000000-0000-0000-0000-000000000007','fb000000-0000-0000-0000-000000000107','ARRIVED',0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'PURCHASE',1,2000),
  -- 8) PICKUP: measuredKg 0 제출 거부(순수 수거 >0 필수)
  ('fb000000-0000-0000-0000-000000000208','fb000000-0000-0000-0000-000000000008','fb000000-0000-0000-0000-000000000108','ARRIVED',10,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,null,null,null),
  -- 9) PURCHASE-only: measuredKg 0 허용, 1통×2000=2000 → −2000 (잔액 5000)
  ('fb000000-0000-0000-0000-000000000209','fb000000-0000-0000-0000-000000000009','fb000000-0000-0000-0000-000000000109','ARRIVED',0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,'PURCHASE',1,2000);

-- POINT net<0 시나리오의 사전 잔액 시드(EARN, order_id null).
select fn_post_ledger('fb000000-0000-0000-0000-000000000002','EARN',10000,null,'seed',null,null);
select fn_post_ledger('fb000000-0000-0000-0000-000000000005','EARN',1000,null,'seed',null,null);
select fn_post_ledger('fb000000-0000-0000-0000-000000000009','EARN',5000,null,'seed',null,null);

-- ============ (1) MIXED POINT net>0 ============
select fn_transition_order('fb000000-0000-0000-0000-000000000201','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000101','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT","deliveredCans":1}'::jsonb);
select fn_transition_order('fb000000-0000-0000-0000-000000000201','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000001','supplier');
select is((select cash_paid_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000201'), 7000, 'net>0: cash_paid_amount 동결=폐유총액 7000');
select is((select purchase_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000201'), 2000, 'net>0: purchase_amount=2000');
select is((select net_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000201'), 5000, 'net>0: net_amount=5000');
select is((select amount from point_ledger where order_id='fb000000-0000-0000-0000-000000000201' and entry_type='EARN'), 5000, 'net>0: EARN(+net)=5000');

-- ============ (2) MIXED POINT net<0 → TRADE_PURCHASE ============
select fn_transition_order('fb000000-0000-0000-0000-000000000202','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000102','rider','{"measuredKg":1.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT","deliveredCans":2}'::jsonb);
select fn_transition_order('fb000000-0000-0000-0000-000000000202','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000002','supplier');
select is((select net_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000202'), -3300, 'net<0: net_amount=-3300');
select is((select amount from point_ledger where order_id='fb000000-0000-0000-0000-000000000202' and entry_type='TRADE_PURCHASE'), -3300, 'net<0: TRADE_PURCHASE(-|net|)=-3300');
select is((select available from v_point_balance where user_id='fb000000-0000-0000-0000-000000000002'), 6700, 'net<0: 잔액 10000-3300=6700');

-- ============ (3) MIXED POINT net=0 → 원장 무기록 ============
select fn_transition_order('fb000000-0000-0000-0000-000000000203','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000103','rider','{"measuredKg":2.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT","deliveredCans":1}'::jsonb);
select fn_transition_order('fb000000-0000-0000-0000-000000000203','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000003','supplier');
select is((select net_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000203'), 0, 'net=0: net_amount=0');
select is((select count(*)::int from point_ledger where order_id='fb000000-0000-0000-0000-000000000203'), 0, 'net=0: 원장 무기록');

-- ============ (4) MIXED CASH → 기록만, 원장 무기록 ============
select fn_transition_order('fb000000-0000-0000-0000-000000000204','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000104','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","deliveredCans":1}'::jsonb);
select fn_transition_order('fb000000-0000-0000-0000-000000000204','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000004','supplier');
select is((select cash_paid_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000204'), 7000, 'CASH: cash_paid_amount=7000');
select is((select net_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000204'), 5000, 'CASH: net_amount=5000');
select is((select count(*)::int from point_ledger where order_id='fb000000-0000-0000-0000-000000000204'), 0, 'CASH: 원장 무기록');

-- ============ (5) 포인트 부족 → INSUFFICIENT_BALANCE, ARRIVED 롤백 ============
select fn_transition_order('fb000000-0000-0000-0000-000000000205','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000105','rider','{"measuredKg":1.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT","deliveredCans":3}'::jsonb);
select throws_ok(
  $$ select fn_transition_order('fb000000-0000-0000-0000-000000000205','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000005','supplier') $$,
  'INSUFFICIENT_BALANCE', '포인트 부족 CONFIRM → INSUFFICIENT_BALANCE');
select is((select status from pickup_orders where id='fb000000-0000-0000-0000-000000000205'), 'ARRIVED', '포인트 부족: 롤백되어 ARRIVED 유지');

-- ============ (6) 레거시 PICKUP POINT 회귀(net=폐유총액, EARN 동일) ============
select fn_transition_order('fb000000-0000-0000-0000-000000000206','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000106','rider','{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb);
select fn_transition_order('fb000000-0000-0000-0000-000000000206','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000006','supplier');
select is((select cash_paid_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000206'), 7000, '레거시: cash_paid_amount=7000');
select is((select purchase_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000206'), 0, '레거시: purchase_amount=0');
select is((select amount from point_ledger where order_id='fb000000-0000-0000-0000-000000000206' and entry_type='EARN'), 7000, '레거시: EARN=7000(기존과 동일)');

-- ============ (7) PURCHASE: deliveredCans 누락 제출 거부 ============
select throws_ok(
  $$ select fn_transition_order('fb000000-0000-0000-0000-000000000207','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000107','rider','{"measuredKg":0.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}'::jsonb) $$,
  'VALIDATION_ERROR', 'PURCHASE 주문 deliveredCans 누락 → VALIDATION_ERROR');

-- ============ (8) PICKUP: measuredKg 0 제출 거부 ============
select throws_ok(
  $$ select fn_transition_order('fb000000-0000-0000-0000-000000000208','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000108','rider','{"measuredKg":0.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH"}'::jsonb) $$,
  'VALIDATION_ERROR', '순수 수거 measuredKg 0 → VALIDATION_ERROR');

-- ============ (9) PURCHASE-only: measuredKg 0 허용 + net<0 상계 ============
select fn_transition_order('fb000000-0000-0000-0000-000000000209','SUBMIT_MEASURE','fb000000-0000-0000-0000-000000000109','rider','{"measuredKg":0.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT","deliveredCans":1}'::jsonb);
select is((select delivered_cans from pickup_orders where id='fb000000-0000-0000-0000-000000000209'), 1, 'PURCHASE-only: measuredKg 0 제출 허용(delivered_cans=1)');
select fn_transition_order('fb000000-0000-0000-0000-000000000209','CONFIRM_MEASURE','fb000000-0000-0000-0000-000000000009','supplier');
select is((select net_amount from pickup_orders where id='fb000000-0000-0000-0000-000000000209'), -2000, 'PURCHASE-only: net_amount=-2000');
select is((select amount from point_ledger where order_id='fb000000-0000-0000-0000-000000000209' and entry_type='TRADE_PURCHASE'), -2000, 'PURCHASE-only: TRADE_PURCHASE=-2000');

select * from finish();
rollback;
